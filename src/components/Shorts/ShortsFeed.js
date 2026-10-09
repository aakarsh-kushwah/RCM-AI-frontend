import React, { useCallback, useEffect, useRef, useState } from 'react';
import './ShortsFeed.css';

/* ---------------------------------------------------------------------------
 * ReelsFeed (v4) - unified 9:16 vertical feed for YouTube Shorts + Instagram Reels
 *
 * YouTube : persistent POOL of 3 IFrame API players (unchanged engine).
 *           Players are re-used with loadVideoById(), a swipe never boots an iframe.
 * Instagram: always a native HTML5 <video> (directVideo, or the ig-stream proxy).
 *           The active slide and its neighbours (paused + preloaded) render it, so
 *           both platforms look identical. A reel whose video fails is skipped.
 *           The embed iframe is off by default (ALLOW_EMBED_FALLBACK) and, when
 *           enabled, is sandboxed, cropped and has pointer-events: none.
 *
 * Gestures (both platforms):
 *   single tap  = sound ON + play  <->  pause + mute (one toggle, both together)
 *   double tap  = like + heart burst
 *   hold        = pause + hide UI, release = resume
 *   swipe       = next / previous reel
 *
 * normalizeReel keeps Instagram items and parses shortcode, directVideo,
 * embedUrl and the profile (username / avatar / name).
 * ------------------------------------------------------------------------- */

/* ---------- configuration ---------- */

const API_BASE = (process.env.REACT_APP_API_URL || '').replace(/\/+$/, '');
const API = {
  list: '/api/shorts/feed',
  like: (id) => `/api/shorts/${encodeURIComponent(id)}/like`,
  comments: (id) => `/api/shorts/${encodeURIComponent(id)}/comments`,
  seen: '/api/shorts/seen',
  unavailable: (id) => `/api/shorts/${encodeURIComponent(id)}/unavailable`, // optional backend hook
  igStream: (code) => `/api/shorts/ig-stream/${encodeURIComponent(code)}`, // MP4 proxy for Instagram reels
};

// Instagram items without a direct video URL stream through the proxy above.
const USE_IG_STREAM_PROXY = true;
// Third-party Instagram embeds show white cards, login prompts and "broken link" screens.
// Set ALLOW_EMBED_FALLBACK = true so reels don't get deleted from the feed while streaming.
const ALLOW_EMBED_FALLBACK = true;
const SUBS_KEY = 'rcm_reels_follows';
const BOOKMARKS_KEY = 'rcm_reels_bookmarks';

const ACTIVE_THRESHOLD = 0.5; // slide becomes active when 50% visible (no debounce)
const HOLD_MS = 220;
const DOUBLE_TAP_MS = 260;
const MOVE_SLOP = 10;
const PAGE_SIZE = 10;
const PREFETCH_REMAINING = 5; // load next page when this many reels remain
const POOL_SIZE = 3;
const RENDER_WINDOW = 2; // slides farther than this render only an empty snap point
const VIDEO_WINDOW = 1; // native <video> elements exist only this close to the active slide
const FETCH_TIMEOUT_MS = 15000;
const RETRY_COOLDOWN_MS = 4000;
const WATCHDOG_STUCK_MS = 7000;
const PRELOAD_SETTLE_MS = 150; // neighbours are only preloaded once the user stops flicking
const SEEN_FLUSH_MS = 3000;
const SEEN_FLUSH_COUNT = 10;

/* ---------- network ---------- */

async function api(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  try {
    const token = window.localStorage.getItem('accessToken') || window.localStorage.getItem('token');
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch (e) {
    /* storage unavailable */
  }

  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, FETCH_TIMEOUT_MS);
  const outer = options.signal;
  const onOuterAbort = () => ctl.abort();
  if (outer) {
    if (outer.aborted) ctl.abort();
    else outer.addEventListener('abort', onOuterAbort);
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers, signal: ctl.signal });
    if (!res.ok) {
      const err = new Error(`Request failed with status ${res.status} (${path})`);
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    const type = res.headers.get('content-type') || '';
    return type.includes('json') ? await res.json() : null;
  } catch (e) {
    if (timedOut) {
      const err = new Error(`Request timed out (${path})`);
      err.name = 'TimeoutError';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
    if (outer) outer.removeEventListener('abort', onOuterAbort);
  }
}

export function unwrapList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const keys = ['shorts', 'reels', 'comments', 'data', 'items', 'results'];
    for (let i = 0; i < keys.length; i += 1) {
      if (Array.isArray(payload[keys[i]])) return payload[keys[i]];
    }
  }
  return [];
}

/* ---------- storage ---------- */

function readStore(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch (e) {
    return {};
  }
}

function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* storage unavailable */
  }
}

/* ---------- data normalisation ---------- */

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const IG_URL = /instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/;
const NOT_DIRECT = /^https?:\/\/(?:[\w-]+\.)?(?:youtube\.com|youtu\.be|instagram\.com)\//i;

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** First value that is not undefined / null / empty string. */
function pick(...values) {
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function extractVideoId(short) {
  const direct = short.youtubeId ?? short.youtube_id ?? short.videoId ?? short.video_id ?? short.ytId;
  if (direct && YT_ID.test(String(direct))) return String(direct);
  const url =
    short.youtubeUrl ?? short.youtube_url ?? short.videoUrl ?? short.video_url ?? short.url ?? short.link ?? direct;
  if (typeof url === 'string') {
    const match = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
    if (match) return match[1];
  }
  return null;
}

/** A directly playable media URL (mp4 / CDN). Never a YouTube or Instagram page URL. */
function extractDirectVideo(short) {
  const ig = short.instagram || {};
  const value = pick(
    short.directVideo,
    short.direct_video,
    short.directVideoUrl,
    short.direct_video_url,
    ig.directVideo,
    ig.videoUrl,
    short.videoUrl,
    short.video_url,
    short.mediaUrl,
    short.media_url,
    short.playbackUrl,
    short.playback_url
  );
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value) || NOT_DIRECT.test(value)) return '';
  return value;
}

function extractHashtags(short) {
  const found = new Map();
  const add = (tag) => {
    const clean = String(tag).trim().replace(/^#+/, '').replace(/[.,;:!?)]+$/, '');
    if (clean) found.set(clean.toLowerCase(), clean);
  };
  const explicit = short.hashtags ?? short.tags ?? [];
  (Array.isArray(explicit) ? explicit : String(explicit).split(/[,\s]+/)).forEach(add);
  (String(short.description ?? short.caption ?? '').match(/#[^\s#]+/g) || []).forEach(add);
  return Array.from(found.values());
}

const posterFor = (videoId) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

export function normalizeReel(short) {
  if (!short || typeof short !== 'object') return null;
  const ig = short.instagram && typeof short.instagram === 'object' ? short.instagram : {};
  const urlField = [short.url, short.link, short.permalink, ig.url].find((u) => typeof u === 'string' && IG_URL.test(u));
  const isInstagram =
    short.platform === 'instagram' ||
    short.platform === 2 ||
    String(short.id).startsWith('ig_') ||
    Boolean(short.shortcode || ig.shortcode || urlField);

  const shortcode = String(
    pick(short.shortcode, ig.shortcode, urlField && urlField.match(IG_URL)[1], isInstagram ? String(short.id).replace(/^ig_/, '') : '') || ''
  );
  const videoId = isInstagram ? '' : extractVideoId(short) || '';
  const directRaw = extractDirectVideo(short);
  const proxied = USE_IG_STREAM_PROXY && isInstagram && !directRaw && shortcode ? `${API_BASE}${API.igStream(shortcode)}` : '';
  const directVideo = videoId ? '' : directRaw || proxied;
  const embedUrl = String(pick(short.embedUrl, short.embed_url, ig.embedUrl, shortcode ? `https://www.instagram.com/reel/${shortcode}/embed/` : '') || '');
  if (!videoId && !directVideo && !(ALLOW_EMBED_FALLBACK && isInstagram && embedUrl)) return null;

  const channelObj = short.channel || {};
  const profile = short.profile || short.owner || ig.profile || ig.owner || {};
  const username = String(
    pick(short.username, short.ownerUsername, short.owner_username, ig.username, profile.username, isInstagram ? channelObj.handle : '') || ''
  ).replace(/^@+/, '');
  const fullName = pick(short.fullName, short.full_name, profile.fullName, profile.full_name, profile.name);
  const igUrl = String(pick(urlField, shortcode ? `https://www.instagram.com/reel/${shortcode}/` : '') || '');

  const channelName = isInstagram
    ? pick(fullName, username, short.channelName, short.channel_name, channelObj.name) || 'Instagram'
    : short.channelName ?? short.channel_name ?? short.channelTitle ?? channelObj.name ?? 'Channel';
  const channelHandle = isInstagram ? (username ? `@${username}` : '') : channelObj.handle ?? short.channelHandle ?? '';
  const thumb =
    pick(short.thumbnail, short.thumbnailUrl, short.thumbnail_url, short.displayUrl, short.display_url, short.poster, ig.thumbnail) ||
    (videoId ? posterFor(videoId) : '');

  return {
    id: String(short._id ?? short.id ?? videoId ?? shortcode),
    platform: videoId ? 'youtube' : isInstagram ? 'instagram' : 'video',
    videoId,
    shortcode,
    directVideo,
    embedUrl,
    instagram: isInstagram ? { shortcode, embedUrl, url: igUrl, username, directVideo } : null,
    shareUrl: isInstagram ? igUrl || embedUrl : videoId ? `https://www.youtube.com/shorts/${videoId}` : directVideo,
    profileUrl: username ? `https://www.instagram.com/${username}/` : igUrl,
    title: short.title || short.caption || 'Untitled reel',
    description: String(short.description ?? (short.title ? short.caption : '') ?? ''),
    thumb,
    channelId: String(short.channelId ?? short.channel_id ?? channelObj.id ?? ''),
    channelName,
    channelLogo:
      pick(
        short.channelLogo,
        short.channel_logo,
        short.channelAvatar,
        short.profilePicUrl,
        short.profile_pic_url,
        short.ownerProfilePic,
        profile.profilePicUrl,
        profile.avatar,
        profile.picture,
        ig.profilePic,
        channelObj.logo,
        channelObj.avatar,
        channelObj.logoUrl
      ) || '',
    channelHandle,
    verified: Boolean(short.channelVerified ?? channelObj.verified ?? profile.verified ?? profile.isVerified ?? short.verified ?? false),
    subscribers: num(pick(channelObj.subscriberCount, channelObj.subscribers, profile.followersCount, profile.followers, short.followersCount, 0)),
    likes: num(pick(short.likesCount, short.likes_count, short.likeCount, 0)),
    comments: num(pick(short.commentsCount, short.comments_count, short.commentCount, 0)),
    views: num(pick(short.viewCount, short.view_count, short.views, short.playCount, short.videoPlayCount, 0)),
    date: pick(short.publishedAt, short.published_at, short.takenAt, short.timestamp, short.createdAt, short.created_at) ?? null,
    hashtags: extractHashtags(short),
    liked: Boolean(short.isLiked ?? short.liked ?? short.likedByMe ?? false),
  };
}

function normalizeComment(c, i = 0) {
  const userObj = c.user || {};
  const authorRaw =
    c.userName ?? c.user_name ?? c.username ?? userObj.name ?? userObj.username ?? userObj.fullName ?? c.author?.name ?? c.author;
  const author = typeof authorRaw === 'string' && authorRaw.trim() ? authorRaw.trim() : 'User';
  const avatar = c.avatar ?? userObj.avatar ?? '';
  return {
    id: String(c._id ?? c.id ?? `c-${i}`),
    author,
    avatar,
    text: String(c.text ?? c.content ?? c.comment ?? c.body ?? ''),
    date: c.createdAt ?? c.created_at ?? c.date ?? null,
    pending: false,
  };
}

export const titleOf = (r) => r.title || 'Untitled reel';
export const nameOf = (r) => r.channelName || 'Channel';
export const soundOf = (r) => `${nameOf(r)} · Original audio`;

/* ---------- formatting ---------- */

const compactFormatter = (() => {
  try {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  } catch (e) {
    return null;
  }
})();

export function formatCount(value) {
  const n = num(value);
  return compactFormatter ? compactFormatter.format(n) : String(n);
}

export function formatDate(value) {
  if (!value) return 'Unknown';
  const d = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function timeAgo(value) {
  if (!value) return '';
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.max(1, Math.floor(d / 365))}y`;
}

export function hueFor(name) {
  let hash = 0;
  const str = String(name || '');
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) % 360;
  return hash;
}

function initialOf(name) {
  return (Array.from(String(name || '?').trim().replace(/^@+/, ''))[0] || '?').toUpperCase();
}

/* ---------- misc helpers ---------- */

export function shouldStartMuted() {
  try {
    return !(navigator.userActivation && navigator.userActivation.hasBeenActive);
  } catch (e) {
    return true;
  }
}

function goBack() {
  if (window.history.length > 1) window.history.back();
  else window.location.assign('/');
}

export function addPreconnect(href) {
  try {
    if (document.head.querySelector(`link[rel="preconnect"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = href;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  } catch (e) {
    /* non-critical */
  }
}

function isLowEndDevice() {
  try {
    const mem = navigator.deviceMemory;
    const cores = navigator.hardwareConcurrency;
    return Boolean((mem && mem <= 4) || (cores && cores <= 4));
  } catch (e) {
    return false;
  }
}

function isLiteConnection() {
  try {
    const c = navigator.connection;
    return Boolean(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')));
  } catch (e) {
    return false;
  }
}

/* ---------- extra styles (injected once, so the existing CSS file needs no change) ---------- */

const EXTRA_CSS = `
.rf-root .rf-caption-title{-webkit-line-clamp:1;line-clamp:1}
.rf-root .rf-disc{border-radius:50%;animation:rf-disc-spin 6s linear infinite}
.rf-root .rf-disc-art.rf-avatar{border-radius:50%}
.rf-root .rf-slide:not(.is-active) .rf-disc{animation-play-state:paused}
.rf-root .rf-ig-video,.rf-root .rf-ig-embed,.rf-root .rf-ig-embed iframe{pointer-events:none}
.rf-root .rf-tap{z-index:2}
@keyframes rf-disc-spin{to{transform:rotate(360deg)}}
`;

function ensureExtraStyles() {
  try {
    if (document.getElementById('rf-extra-styles')) return;
    const style = document.createElement('style');
    style.id = 'rf-extra-styles';
    style.textContent = EXTRA_CSS;
    document.head.appendChild(style);
  } catch (e) {
    /* non-critical */
  }
}

/* ---------- YouTube IFrame API loader ---------- */

let ytPromise = null;

export function ensureYT() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytPromise) return ytPromise;
  ytPromise = new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      if (!value) ytPromise = null; // allow a later retry
      resolve(value);
    };
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === 'function') {
        try {
          previous();
        } catch (e) {
          /* ignore third-party callback errors */
        }
      }
      finish(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => finish(null);
    document.head.appendChild(script);
    setTimeout(() => finish(window.YT && window.YT.Player ? window.YT : null), 15000);
  });
  return ytPromise;
}

/* ---------------------------------------------------------------------------
 * Player pool engine (YouTube only). Plain functions, state lives in a ctx
 * object so React re-renders can never disturb playback.
 * ------------------------------------------------------------------------- */

function createCtx() {
  const ctx = {
    YT: null,
    props: { reels: [], activeIndex: 0, muted: true, paused: false },
    cb: {},
    lastActive: 0,
    dir: 1,
    settleTimer: null,
    slots: [],
  };
  for (let i = 0; i < POOL_SIZE; i += 1) {
    const slot = {
      id: i,
      el: null,
      player: null,
      ready: false,
      reelId: null,
      videoId: null,
      loadedId: null,
      state: -1,
      firstFrame: false,
      mutedNow: true,
      wasActive: false,
      needsRewind: false,
      retried: false,
      assignedAt: 0,
    };
    slot.setRef = (node) => {
      slot.el = node;
    };
    ctx.slots.push(slot);
  }
  return ctx;
}

function call(slot, fn, ...args) {
  try {
    if (slot.player && slot.ready && typeof slot.player[fn] === 'function') return slot.player[fn](...args);
  } catch (e) {
    /* player may be mid-teardown */
  }
  return undefined;
}

function isActiveSlot(ctx, slot) {
  const reel = ctx.props.reels[ctx.props.activeIndex];
  return Boolean(reel && slot.reelId === reel.id);
}

function revealSlot(slot) {
  if (slot.el) slot.el.classList.add('is-shown');
}

function createPlayer(ctx, slot) {
  if (slot.player || !ctx.YT || !slot.el || !slot.videoId) return;
  const host = document.createElement('div');
  slot.el.appendChild(host);
  slot.loadedId = slot.videoId;
  try {
    slot.player = new ctx.YT.Player(host, {
      width: '100%',
      height: '100%',
      videoId: slot.videoId,
      playerVars: {
        autoplay: 1,
        mute: 1,
        controls: 0,
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        iv_load_policy: 3,
        disablekb: 1,
        fs: 0,
        enablejsapi: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: () => onSlotReady(ctx, slot),
        onStateChange: (e) => onSlotState(ctx, slot, e),
        onError: (e) => onSlotError(ctx, slot, e),
      },
    });
  } catch (e) {
    slot.player = null;
  }
}

function onSlotReady(ctx, slot) {
  slot.ready = true;
  call(slot, 'mute');
  slot.mutedNow = true;
  if (slot.videoId && slot.loadedId !== slot.videoId) {
    slot.loadedId = slot.videoId;
    call(slot, 'loadVideoById', { videoId: slot.videoId, startSeconds: 0 });
  }
  applySlot(ctx, slot);
}

function onSlotState(ctx, slot, e) {
  const s = e && typeof e.data === 'number' ? e.data : -1;
  slot.state = s;
  const active = isActiveSlot(ctx, slot);
  if (window.__RF_DEBUG) {
    // eslint-disable-next-line no-console
    console.log('[rf]', `slot${slot.id}`, slot.reelId, 'state', s, active ? 'ACTIVE' : 'bg', Math.round(performance.now()));
  }
  if (s === 1) {
    if (!slot.firstFrame) {
      slot.firstFrame = true;
      // Preloaded neighbour: park it on its first frame. No seekTo here: a seek
      // forces a re-buffer, which is exactly the black screen + spinner.
      if (!active) call(slot, 'pauseVideo');
    }
    revealSlot(slot);
  } else if (s === 3) {
    // Buffering at the very start: hide the player so the poster shows instead
    // of a black frame with YouTube's spinner.
    const t = call(slot, 'getCurrentTime');
    if (slot.el && !(t > 0.5)) slot.el.classList.remove('is-shown');
  } else if (s === 0 && active) {
    call(slot, 'seekTo', 0, true); // loop like Reels
    call(slot, 'playVideo');
  }
  applySlot(ctx, slot);
}

function onSlotError(ctx, slot, e) {
  const code = e && e.data;
  if (code === 5 && !slot.retried) {
    slot.retried = true;
    call(slot, 'loadVideoById', { videoId: slot.videoId, startSeconds: 0 });
    return;
  }
  if (slot.reelId && ctx.cb.onBad) ctx.cb.onBad(slot.reelId, code);
}

function applySlot(ctx, slot) {
  if (!slot.reelId) return;
  const active = isActiveSlot(ctx, slot);
  const wasActive = slot.wasActive;
  slot.wasActive = active;
  if (!slot.ready) return;

  const { muted, paused } = ctx.props;

  if (wasActive && !active) {
    call(slot, 'pauseVideo');
    slot.needsRewind = true; // rewind lazily, only if the user comes back to it
  }

  if (!active) {
    if (!slot.mutedNow) {
      call(slot, 'mute');
      slot.mutedNow = true;
    }
    if (slot.firstFrame && (slot.state === 1 || slot.state === 3)) call(slot, 'pauseVideo');
    return;
  }

  if (muted) {
    if (!slot.mutedNow) {
      call(slot, 'mute');
      slot.mutedNow = true;
    }
  } else if (slot.mutedNow) {
    call(slot, 'unMute');
    call(slot, 'setVolume', 100);
    slot.mutedNow = false;
    setTimeout(() => {
      if (!slot.player || !isActiveSlot(ctx, slot) || ctx.props.muted) return;
      let stillMuted = false;
      try {
        stillMuted = Boolean(slot.player.isMuted && slot.player.isMuted());
      } catch (e) {
        stillMuted = false;
      }
      if (stillMuted) {
        slot.mutedNow = true;
        if (ctx.cb.onForceMute) ctx.cb.onForceMute(); // browser blocked sound without a tap
      }
    }, 500);
  }

  if (slot.needsRewind) {
    slot.needsRewind = false;
    call(slot, 'seekTo', 0, true);
  }

  const shouldPlay = !paused && !document.hidden;
  if (shouldPlay && slot.state !== 1 && slot.state !== 3) call(slot, 'playVideo');
  else if (!shouldPlay && (slot.state === 1 || slot.state === 3)) call(slot, 'pauseVideo');
}

function releaseSlot(slot) {
  call(slot, 'mute');
  call(slot, 'pauseVideo');
  slot.mutedNow = true;
  slot.reelId = null;
  slot.state = -1;
  slot.firstFrame = false;
  slot.wasActive = false;
  if (slot.el) {
    slot.el.classList.remove('is-shown');
    slot.el.style.visibility = 'hidden';
    slot.el.style.transform = 'translateY(0)';
  }
}

function assignSlot(ctx, slot, reel) {
  slot.reelId = reel.id;
  slot.videoId = reel.videoId;
  slot.firstFrame = false;
  slot.state = -1;
  slot.retried = false;
  slot.wasActive = false;
  slot.needsRewind = false;
  slot.assignedAt = Date.now();
  if (slot.el) slot.el.classList.remove('is-shown');
  if (slot.player && slot.ready) {
    call(slot, 'mute');
    slot.mutedNow = true;
    slot.loadedId = reel.videoId;
    call(slot, 'loadVideoById', { videoId: reel.videoId, startSeconds: 0 });
  }
  // If the player is not ready yet, onSlotReady loads slot.videoId.
}

/** Only YouTube reels (with a videoId) are ever handed to the pool. */
function wantedIndexes(ctx) {
  const { reels, activeIndex } = ctx.props;
  const list = [activeIndex];
  if (!isLiteConnection()) {
    if (isLowEndDevice()) list.push(ctx.dir >= 0 ? activeIndex + 1 : activeIndex - 1); // 2 players only
    else if (ctx.dir >= 0) list.push(activeIndex + 1, activeIndex + 2);
    else list.push(activeIndex - 1, activeIndex + 1);
  }
  return list.filter((i) => i >= 0 && i < reels.length && reels[i].videoId);
}

function syncPool(ctx, settled = false) {
  const { reels, activeIndex } = ctx.props;
  if (activeIndex !== ctx.lastActive) {
    ctx.dir = activeIndex > ctx.lastActive ? 1 : -1;
    ctx.lastActive = activeIndex;
  }
  if (reels.length === 0) {
    ctx.slots.forEach((s) => s.reelId && releaseSlot(s));
    return;
  }
  const idxOf = new Map();
  reels.forEach((r, i) => idxOf.set(r.id, i));
  const activeId = reels[activeIndex] ? reels[activeIndex].id : null;
  const wantIds = wantedIndexes(ctx).map((i) => reels[i].id);
  const wantSet = new Set(wantIds);

  ctx.slots.forEach((s) => {
    if (s.reelId && (!wantSet.has(s.reelId) || !idxOf.has(s.reelId))) releaseSlot(s);
  });

  // The active reel is assigned immediately. Neighbours wait until scrolling
  // has settled, so a fast flick never spawns loads for reels it flies past.
  let deferred = false;
  wantIds.forEach((id) => {
    if (ctx.slots.some((s) => s.reelId === id)) return;
    if (id !== activeId && !settled) {
      deferred = true;
      return;
    }
    const free = ctx.slots.find((s) => !s.reelId);
    if (free) assignSlot(ctx, free, reels[idxOf.get(id)]);
  });
  clearTimeout(ctx.settleTimer);
  if (deferred) ctx.settleTimer = setTimeout(() => syncPool(ctx, true), PRELOAD_SETTLE_MS);

  ctx.slots.forEach((s) => {
    if (!s.el) return;
    if (!s.reelId) {
      s.el.style.visibility = 'hidden';
      return;
    }
    if (!s.player) createPlayer(ctx, s);
    s.el.style.visibility = 'visible';
    s.el.style.transform = `translateY(calc(var(--rf-h) * ${idxOf.get(s.reelId)}))`;
    applySlot(ctx, s);
  });
}

function watchdog(ctx) {
  const now = Date.now();
  ctx.slots.forEach((s) => {
    if (s.ready && s.reelId && !s.firstFrame && !s.retried && now - s.assignedAt > WATCHDOG_STUCK_MS) {
      s.retried = true;
      s.assignedAt = now;
      call(s, 'loadVideoById', { videoId: s.videoId, startSeconds: 0 });
    }
  });
}

function PlayerPool({ reels, activeIndex, muted, paused, onBad, onForceMute, onPlayerFail, apiRef }) {
  const ctxRef = useRef(null);
  if (!ctxRef.current) ctxRef.current = createCtx();
  const ctx = ctxRef.current;
  ctx.props = { reels, activeIndex, muted, paused };
  ctx.cb = { onBad, onForceMute };
  const failRef = useRef(onPlayerFail);
  failRef.current = onPlayerFail;
  const [ytReady, setYtReady] = useState(false);

  useEffect(() => {
    let alive = true;
    ensureYT().then((YT) => {
      if (!alive) return;
      if (!YT) {
        if (failRef.current) failRef.current();
        return;
      }
      ctx.YT = YT;
      setYtReady(true);
    });
    return () => {
      alive = false;
    };
  }, [ctx]);

  useEffect(() => {
    syncPool(ctx);
  }, [ctx, reels, activeIndex, muted, paused, ytReady]);

  useEffect(() => {
    const onVisibility = () => syncPool(ctx);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = setInterval(() => watchdog(ctx), 2000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(timer);
    };
  }, [ctx]);

  useEffect(() => {
    apiRef.current = {
      getProgress: () => {
        const s = ctx.slots.find((x) => isActiveSlot(ctx, x));
        if (!s || !s.ready || !s.firstFrame) return null;
        const d = call(s, 'getDuration');
        const t = call(s, 'getCurrentTime');
        return d > 0 && typeof t === 'number' ? t / d : null;
      },
      seekTo: (ratio) => {
        const s = ctx.slots.find((x) => isActiveSlot(ctx, x));
        if (!s || !s.ready) return;
        const d = call(s, 'getDuration');
        if (d > 0) call(s, 'seekTo', ratio * d, true);
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [ctx, apiRef]);

  useEffect(
    () => () => {
      clearTimeout(ctx.settleTimer);
      ctx.slots.forEach((s) => {
        try {
          if (s.player && s.player.destroy) s.player.destroy();
        } catch (e) {
          /* already gone */
        }
        s.player = null;
        s.ready = false;
      });
    },
    [ctx]
  );

  return (
    <div className="rf-pool" aria-hidden="true">
      {ctx.slots.map((s) => (
        <div key={s.id} ref={s.setRef} className="rf-slot" />
      ))}
    </div>
  );
}

/* ---------- icons ---------- */

function Icon({ children, size = 24, fill = 'none', stroke = 'currentColor', sw = 2 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={fill}
      stroke={stroke}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function HeartIcon({ filled }) {
  return (
    <Icon fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </Icon>
  );
}

function CommentIcon() {
  return (
    <Icon>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Icon>
  );
}

function ShareIcon() {
  return (
    <Icon>
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </Icon>
  );
}

function BookmarkIcon({ filled }) {
  return (
    <Icon fill={filled ? 'currentColor' : 'none'}>
      <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </Icon>
  );
}

function MoreIcon() {
  return (
    <Icon fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </Icon>
  );
}

function BackIcon() {
  return (
    <Icon>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </Icon>
  );
}

function VolumeIcon({ muted, size = 24 }) {
  return (
    <Icon size={size}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
      {muted ? (
        <>
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </>
      )}
    </Icon>
  );
}

function PauseIcon({ size = 24 }) {
  return (
    <Icon size={size} fill="currentColor" stroke="none">
      <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
      <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
    </Icon>
  );
}

function PlayIcon({ size = 24 }) {
  return (
    <Icon size={size} fill="currentColor" stroke="none">
      <path d="M7 4.6v14.8a1 1 0 0 0 1.5.86l12-7.4a1 1 0 0 0 0-1.72l-12-7.4A1 1 0 0 0 7 4.6z" />
    </Icon>
  );
}

function CloseIcon() {
  return (
    <Icon>
      <path d="M18 6L6 18M6 6l12 12" />
    </Icon>
  );
}

function SendIcon() {
  return (
    <Icon size={20}>
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </Icon>
  );
}

function ChevronIcon({ up }) {
  return (
    <Icon>
      <path d={up ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
    </Icon>
  );
}

function VerifiedBadge() {
  return (
    <svg className="rf-verified" viewBox="0 0 22 22" width="14" height="14" aria-hidden="true">
      <path
        fill="#3b9dff"
        d="M11 0l1.9 1.6 2.4-.7 1.2 2.2 2.4.4.1 2.5 2 1.4-1 2.3 1 2.3-2 1.4-.1 2.5-2.4.4-1.2 2.2-2.4-.7L11 22l-1.9-1.6-2.4.7-1.2-2.2-2.4-.4-.1-2.5-2-1.4 1-2.3-1-2.3 2-1.4.1-2.5 2.4-.4 1.2-2.2 2.4.7z"
      />
      <path fill="#fff" d="M9.7 14.9L6.4 11.6l1.1-1.1 2.2 2.2 4.6-4.6 1.1 1.1z" />
    </svg>
  );
}

/* ---------- small building blocks ---------- */

function Avatar({ name, src, className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (src && !failed) {
    return (
      <img
        className={`rf-avatar ${className}`}
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className={`rf-avatar ${className}`} style={{ background: `hsl(${hueFor(name)}, 62%, 42%)` }} aria-hidden="true">
      {initialOf(name)}
    </span>
  );
}

function RailButton({ label, caption, active, onClick, tone, children }) {
  return (
    <button
      type="button"
      className={`rf-rail-btn${active ? ' is-active' : ''}${tone ? ` rf-rail-btn--${tone}` : ''}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={typeof active === 'boolean' ? active : undefined}
    >
      <span className="rf-rail-icon">{children}</span>
      {caption ? <span className="rf-rail-caption">{caption}</span> : null}
    </button>
  );
}

function StateCard({ title, body, actionLabel, onAction }) {
  return (
    <div className="rf-state" role="status">
      <h2>{title}</h2>
      <p>{body}</p>
      {actionLabel && (
        <button type="button" className="rf-pill-btn" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="rf-skeleton" role="status" aria-label="Loading Reels">
      <div className="rf-skel-stage">
        <div className="rf-skel-rail">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="rf-skel-meta">
          <div className="rf-skel-row">
            <span className="rf-skel-dot" />
            <span className="rf-skel-bar rf-w40" />
          </div>
          <span className="rf-skel-bar rf-w90" />
          <span className="rf-skel-bar rf-w60" />
        </div>
      </div>
    </div>
  );
}

/* ---------- bottom sheet ---------- */

function Sheet({ open, title, meta, onClose, children, footer }) {
  const sheetRef = useRef(null);
  const drag = useRef(null);

  const onDown = (e) => {
    if (e.target.closest && e.target.closest('button')) return;
    drag.current = { startY: e.clientY, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  };
  const onMove = (e) => {
    if (!drag.current || !sheetRef.current) return;
    const dy = Math.max(0, e.clientY - drag.current.startY);
    drag.current.dy = dy;
    sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onUp = () => {
    if (!drag.current) return;
    const dy = drag.current.dy || 0;
    drag.current = null;
    if (sheetRef.current) {
      sheetRef.current.style.transition = '';
      sheetRef.current.style.transform = '';
    }
    if (dy > 90) onClose();
  };

  return (
    <div className={`rf-sheet-root${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <div className="rf-backdrop" onClick={onClose} />
      <div ref={sheetRef} className="rf-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="rf-sheet-top" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="rf-sheet-grab" aria-hidden="true" />
          <header className="rf-sheet-head">
            <h2>
              {title}
              {meta ? <span className="rf-sheet-meta">{meta}</span> : null}
            </h2>
            <button type="button" className="rf-icon-btn" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </header>
        </div>
        <div className="rf-sheet-body">{children}</div>
        {footer}
      </div>
    </div>
  );
}

function CommentsSheet({ reel, open, onClose, onCountDelta }) {
  const reelId = reel ? reel.id : null;
  const [items, setItems] = useState([]);
  const [state, setState] = useState('idle');
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!open || !reelId) return undefined;
    const controller = new AbortController();
    setItems([]);
    setPostError('');
    setState('loading');
    api(API.comments(reelId), { signal: controller.signal })
      .then((payload) => {
        setItems(unwrapList(payload).map(normalizeComment));
        setState('ready');
      })
      .catch((err) => {
        if (err && err.name !== 'AbortError') setState('error');
      });
    return () => controller.abort();
  }, [open, reelId, reloadKey]);

  const submit = async () => {
    const value = text.trim();
    if (!value || posting || !reelId) return;
    const tempId = `tmp-${Date.now()}`;
    setPosting(true);
    setPostError('');
    setText('');
    setState('ready');
    setItems((prev) => [
      { id: tempId, author: 'You', avatar: '', text: value, date: new Date().toISOString(), pending: true },
      ...prev,
    ]);
    onCountDelta(reelId, 1);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    try {
      // Backend contract: send the same text under the 3 names the API may read.
      const saved = await api(API.comments(reelId), {
        method: 'POST',
        body: JSON.stringify({ comment: value, text: value, content: value }),
      });
      const payload = saved && typeof saved === 'object' ? saved.data ?? saved.comment ?? saved : null;
      setItems((prev) =>
        prev.map((c) => {
          if (c.id !== tempId) return c;
          if (!payload) return { ...c, pending: false };
          const real = normalizeComment(payload);
          return { ...real, author: real.author === 'User' ? 'You' : real.author };
        })
      );
    } catch (err) {
      setItems((prev) => prev.filter((c) => c.id !== tempId));
      onCountDelta(reelId, -1);
      setText(value);
      setPostError("Couldn't post your comment. Check your connection and try again.");
    } finally {
      setPosting(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const footer = (
    <div className="rf-compose-wrap">
      {postError ? (
        <p className="rf-inline-error" role="alert">
          {postError}
        </p>
      ) : null}
      <div className="rf-compose">
        <input
          type="text"
          className="rf-input"
          placeholder="Add a comment"
          value={text}
          maxLength={500}
          enterKeyHint="send"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Add a comment"
        />
        <button type="button" className="rf-send" onClick={submit} disabled={!text.trim() || posting} aria-label="Post comment">
          <SendIcon />
        </button>
      </div>
    </div>
  );

  return (
    <Sheet open={open} title="Comments" meta={reel ? formatCount(reel.comments) : ''} onClose={onClose} footer={footer}>
      <div ref={bodyRef} className="rf-comments">
        {state === 'loading' && items.length === 0 && (
          <div className="rf-comment-skeletons" role="status" aria-label="Loading comments">
            <span />
            <span />
            <span />
          </div>
        )}
        {state === 'error' && (
          <div className="rf-sheet-empty">
            <p>Couldn&apos;t load comments.</p>
            <button type="button" className="rf-pill-btn" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </button>
          </div>
        )}
        {state === 'ready' && items.length === 0 && (
          <div className="rf-sheet-empty">
            <p>No comments yet.</p>
            <span>Be the first to say something.</span>
          </div>
        )}
        {items.length > 0 && (
          <ul className="rf-comment-list">
            {items.map((c) => (
              <li key={c.id} className={`rf-comment${c.pending ? ' is-pending' : ''}`}>
                <Avatar name={c.author} src={c.avatar} className="rf-avatar--sm" />
                <div className="rf-comment-main">
                  <div className="rf-comment-head">
                    <strong>{c.author}</strong>
                    <time>{c.pending ? 'Posting' : timeAgo(c.date)}</time>
                  </div>
                  <p>{c.text}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

function DetailsSheet({ reel, open, onClose, onOpenChannel, following, onToggleFollow }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (open) setExpanded(false);
  }, [open]);

  if (!reel) return null;
  const desc = reel.description || 'No description provided.';
  const isLong = desc.length > 120;
  const displayText = expanded || !isLong ? desc : `${desc.slice(0, 120)}...`;

  return (
    <Sheet open={open} title="Details" onClose={onClose}>
      <div className="rf-details">
        <div className="rf-d-header">
          <button type="button" className="rf-d-channel-info" onClick={() => onOpenChannel(reel)} aria-label={`View ${nameOf(reel)} channel profile`}>
            <Avatar name={nameOf(reel)} src={reel.channelLogo} />
            <div className="rf-d-channel-text">
              <span className="rf-d-channel-name">
                {nameOf(reel)}
                {reel.verified && <VerifiedBadge />}
              </span>
              <span className="rf-d-channel-handle">{reel.channelHandle || '@channel'}</span>
            </div>
          </button>
          <button type="button" className={`rf-follow${following ? ' is-on' : ''}`} aria-pressed={following} onClick={() => onToggleFollow(reel.channelId || nameOf(reel))}>
            {following ? 'Following' : 'Follow'}
          </button>
        </div>

        <h3 className="rf-d-title">{titleOf(reel)}</h3>

        <div className="rf-d-stats">
          <div>
            <strong title={reel.views.toLocaleString('en-IN')}>{formatCount(reel.views)}</strong>
            <span>Views</span>
          </div>
          <div>
            <strong>{formatCount(reel.likes)}</strong>
            <span>Likes</span>
          </div>
          <div>
            <strong>{formatDate(reel.date)}</strong>
            <span>Posted</span>
          </div>
        </div>

        <p className="rf-d-desc">
          {displayText}
          {isLong && (
            <button type="button" className="rf-more-btn" onClick={() => setExpanded((e) => !e)}>
              {expanded ? '...less' : '...more'}
            </button>
          )}
        </p>

        {reel.hashtags.length > 0 && (
          <div className="rf-tags">
            {reel.hashtags.map((tag) => (
              <span key={tag} className="rf-tag">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function ChannelProfileSheet({ channelId, channelName, channelLogo, channelHandle, verified, subscribers, open, onClose, following, onToggleFollow, onSelectReel }) {
  const [reels, setReels] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!open || !channelId) return undefined;
    const controller = new AbortController();
    setStatus('loading');
    api(`/api/shorts?channelId=${encodeURIComponent(channelId)}`, { signal: controller.signal })
      .then((payload) => {
        setReels(unwrapList(payload).map(normalizeReel).filter(Boolean));
        setStatus('ready');
      })
      .catch((err) => {
        if (err && err.name !== 'AbortError') setStatus('error');
      });
    return () => controller.abort();
  }, [open, channelId]);

  return (
    <Sheet open={open} title="Channel" onClose={onClose}>
      <div className="rf-cp-profile">
        <div className="rf-cp-top">
          <Avatar name={channelName} src={channelLogo} className="rf-cp-avatar" />
          <h3 className="rf-cp-name">
            {channelName}
            {verified && <VerifiedBadge />}
          </h3>
          {channelHandle ? <span className="rf-cp-handle">{channelHandle}</span> : null}
          <span className="rf-cp-subscribers">{subscribers > 0 ? `${formatCount(subscribers)} followers` : 'Official Channel'}</span>
          <button type="button" className={`rf-follow${following ? ' is-on' : ''}`} aria-pressed={following} onClick={() => onToggleFollow(channelId || channelName)}>
            {following ? 'Following' : 'Follow'}
          </button>
        </div>

        <div className="rf-cp-grid-title">Reels ({reels.length})</div>
        {status === 'loading' && (
          <div className="rf-sheet-empty">
            <p>Loading channel reels...</p>
          </div>
        )}
        {status === 'error' && (
          <div className="rf-sheet-empty">
            <p>Couldn&apos;t load channel reels.</p>
          </div>
        )}
        {status === 'ready' && reels.length === 0 && (
          <div className="rf-sheet-empty">
            <p>No reels from this channel yet.</p>
          </div>
        )}
        {status === 'ready' && reels.length > 0 && (
          <div className="rf-cp-grid">
            {reels.map((r) => (
              <div
                key={r.id}
                className="rf-cp-thumb"
                onClick={() => {
                  onClose();
                  onSelectReel(r.id);
                }}
                role="button"
                tabIndex={0}
                aria-label={titleOf(r)}
              >
                {r.thumb ? <img src={r.thumb} alt="" loading="lazy" /> : null}
                <span className="rf-cp-views">{formatCount(r.views)} views</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- Instagram media (native <video> + cropped embed fallback) ---------- */

const MEDIA_LAYER = { position: 'absolute', inset: 0, zIndex: 1, overflow: 'hidden', background: '#000', pointerEvents: 'none' };

/**
 * Native HTML5 video for items that carry a direct media URL. Plays instantly
 * when its slide becomes active, pauses + rewinds when it leaves, and follows
 * the global mute / pause state. Neighbours (+/-1) preload paused.
 */
function NativeVideo({ reel, isActive, near, muted, paused, onRegister, onForceMute, onFail }) {
  const ref = useRef(null);
  const wasActive = useRef(false);
  const [shown, setShown] = useState(false);

  const setRef = useCallback(
    (node) => {
      ref.current = node;
      onRegister(reel.id, node);
    },
    [onRegister, reel.id]
  );

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = muted;
    if (isActive) {
      if (paused || document.hidden) {
        v.pause();
      } else {
        const p = v.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            // Sound without a user gesture is blocked by the browser: fall back to muted playback.
            if (!v.muted) onForceMute();
          });
        }
      }
    } else {
      v.pause();
      if (wasActive.current) {
        try {
          v.currentTime = 0;
        } catch (e) {
          /* not seekable yet */
        }
      }
    }
    wasActive.current = isActive;
  }, [isActive, paused, muted, onForceMute, near]);

  useEffect(() => {
    if (!isActive) return undefined;
    const onVis = () => {
      const v = ref.current;
      if (!v) return;
      if (document.hidden) v.pause();
      else if (!paused) {
        const p = v.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [isActive, paused]);

  if (!near) return null;
  const videoSrc = reel.directVideo || (reel.platform === 'instagram' && reel.shortcode ? `${API_BASE}${API.igStream(reel.shortcode)}` : '');
  return (
    <video
      ref={setRef}
      className="rf-ig-video"
      src={videoSrc}
      poster={reel.thumb || undefined}
      playsInline
      loop
      muted={muted}
      autoPlay={isActive}
      preload={isActive ? 'auto' : 'metadata'}
      disablePictureInPicture
      controlsList="nodownload noplaybackrate noremoteplayback"
      onLoadedData={() => setShown(true)}
      onPlaying={() => setShown(true)}
      onError={onFail}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        background: '#000',
        pointerEvents: 'none !important', // taps are handled by the tap layer above
        opacity: shown ? 1 : 0,
        transition: 'opacity 0.15s ease',
      }}
    />
  );
}

/** Last resort when there is no direct video: Instagram's embed, shifted + oversized so its header/footer are cropped away. */
function CroppedEmbed({ reel }) {
  return (
    <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'hidden', background: '#000', pointerEvents: 'none' }}>
      <iframe
        src={reel.embedUrl}
        title={titleOf(reel)}
        tabIndex={-1}
        aria-hidden="true"
        scrolling="no"
        style={{
          position: 'absolute',
          top: '-25%',
          left: '-10%',
          width: '120%',
          height: '150%',
          border: 'none',
          pointerEvents: 'none !important',
        }}
      />
    </div>
  );
}

/* ---------- one full-screen slide (poster + UI; YouTube video lives in the pool) ---------- */

const ReelSlide = React.memo(function ReelSlide({
  reel,
  index,
  light,
  isActive,
  nearVideo,
  muted,
  paused,
  uiHidden,
  following,
  bookmarked,
  registerVideo,
  onForceMute,
  onBad,
  onLike,
  onOpenComments,
  onOpenDetails,
  onOpenChannel,
  onShare,
  onToggleFollow,
  onToggleBookmark,
  onTapDown,
  onTapMove,
  onTapUp,
  onTapCancel,
}) {
  const [expanded, setExpanded] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  useEffect(() => {
    if (!isActive) setExpanded(false);
  }, [isActive]);
  const failVideo = useCallback(() => {
    // NEVER call onBad(reel.id) here!
    // Fall back smoothly to CroppedEmbed instead of deleting the reel from state
    setVideoFailed(true);
  }, []);

  // Far-away slides are empty snap points: same height, no images, no UI.
  if (light) {
    return (
      <section className="rf-slide" data-index={index} aria-hidden="true">
        <div className="rf-stage" />
      </section>
    );
  }

  const hasNative = Boolean(reel.directVideo) && !videoFailed;
  const showEmbed = !reel.videoId && (!hasNative || videoFailed) && Boolean(reel.embedUrl || reel.shortcode) && isActive;
  const hasMoreCaption = Boolean(reel.description) || reel.title.length > 70;

  return (
    <section className={`rf-slide${isActive ? ' is-active' : ''}`} data-index={index} aria-label={titleOf(reel)}>
      <div className="rf-stage">
        {reel.thumb ? (
          <img
            className="rf-poster"
            src={reel.thumb}
            alt=""
            draggable="false"
            decoding="async"
            onError={(e) => {
              if (!reel.videoId) return;
              const img = e.currentTarget;
              const fallback = posterFor(reel.videoId);
              if (img.src !== fallback && !img.dataset.fb) {
                img.dataset.fb = '1';
                img.src = fallback;
              }
            }}
          />
        ) : null}

        {hasNative && (
          <NativeVideo
            reel={reel}
            isActive={isActive}
            near={nearVideo}
            muted={muted}
            paused={paused}
            onRegister={registerVideo}
            onForceMute={onForceMute}
            onFail={failVideo}
          />
        )}
        {showEmbed && <CroppedEmbed reel={reel} />}

        <div className="rf-scrim rf-scrim--top" />
        <div className="rf-scrim rf-scrim--bottom" />

        {/* One tap layer for every platform. Media layers have pointer-events: none, so all touches land here. */}
        {isActive && (
          <div
            className="rf-tap"
            onPointerDown={onTapDown}
            onPointerMove={onTapMove}
            onPointerUp={onTapUp}
            onPointerCancel={onTapCancel}
            onContextMenu={(e) => e.preventDefault()}
            style={{ zIndex: 2, position: 'absolute', inset: 0 }}
          />
        )}

        <div className={`rf-hideable${uiHidden ? ' is-hidden' : ''}`}>
          <div className="rf-rail" role="group" aria-label="Actions">
            <RailButton label={reel.liked ? 'Unlike' : 'Like'} caption={formatCount(reel.likes)} active={reel.liked} tone="like" onClick={() => onLike(reel.id)}>
              <HeartIcon filled={reel.liked} />
            </RailButton>
            <RailButton label="Open comments" caption={formatCount(reel.comments)} onClick={() => onOpenComments(reel.id)}>
              <CommentIcon />
            </RailButton>
            <RailButton label="Share" caption="Share" onClick={() => onShare(reel.id)}>
              <ShareIcon />
            </RailButton>
            <RailButton label="Save" caption="Save" active={bookmarked} tone="bookmark" onClick={() => onToggleBookmark(reel.id)}>
              <BookmarkIcon filled={bookmarked} />
            </RailButton>
            <RailButton label="Show details" onClick={() => onOpenDetails(reel.id)}>
              <MoreIcon />
            </RailButton>
            <button type="button" className="rf-disc-btn" onClick={() => onOpenChannel(reel)} aria-label={`${nameOf(reel)} channel`}>
              <span className="rf-disc">
                <Avatar name={nameOf(reel)} src={reel.channelLogo} className="rf-disc-art" />
              </span>
            </button>
          </div>

          <div className="rf-meta">
            <div className="rf-creator">
              <button type="button" className="rf-creator-main" onClick={() => onOpenChannel(reel)} aria-label={`View ${nameOf(reel)} profile`}>
                <Avatar name={nameOf(reel)} src={reel.channelLogo} />
                <span className="rf-creator-name">
                  {nameOf(reel)}
                  {reel.verified && <VerifiedBadge />}
                </span>
              </button>
              <button
                type="button"
                className={`rf-follow rf-follow--sm${following ? ' is-on' : ''}`}
                aria-pressed={following}
                onClick={() => onToggleFollow(reel.channelId || nameOf(reel))}
              >
                {following ? 'Following' : 'Follow'}
              </button>
            </div>

            <button
              type="button"
              className={`rf-caption${expanded ? ' is-open' : ''}`}
              onClick={() => (hasMoreCaption ? setExpanded((v) => !v) : onOpenDetails(reel.id))}
              aria-expanded={hasMoreCaption ? expanded : undefined}
            >
              <span className="rf-caption-title">{titleOf(reel)}</span>
              {expanded && reel.description ? <span className="rf-caption-desc">{reel.description}</span> : null}
              {!expanded && hasMoreCaption ? <span className="rf-caption-more">…more</span> : null}
            </button>

            <div className="rf-sound-line">
              <svg className="rf-sound-note" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                <path fill="currentColor" d="M9 18V5l12-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zm12-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3z" />
              </svg>
              <div className="rf-marquee">
                <span>
                  {soundOf(reel)} &nbsp;&nbsp;•&nbsp;&nbsp; {soundOf(reel)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

/* ---------- error boundary ---------- */

class FeedErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[Reels] feed crashed', error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="rf-root" aria-label="Reels">
          <StateCard
            title="Something went wrong"
            body="Reels stopped unexpectedly. Reload the feed to continue."
            actionLabel="Reload Reels"
            onAction={() => this.setState({ failed: false })}
          />
        </main>
      );
    }
    return this.props.children;
  }
}

/* ---------------------------------------------------------------------------
 * The feed
 * ------------------------------------------------------------------------- */

function ReelsFeedInner() {
  const [reels, setReels] = useState([]);
  const [status, setStatus] = useState('loading');
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(shouldStartMuted);
  const [holding, setHolding] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [follows, setFollows] = useState(() => readStore(SUBS_KEY));
  const [bookmarks, setBookmarks] = useState(() => readStore(BOOKMARKS_KEY));
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState('');
  const [pulse, setPulse] = useState(null);
  const [burst, setBurst] = useState(null);

  const scrollerRef = useRef(null);
  const fillRef = useRef(null);
  const trackRef = useRef(null);
  const poolApiRef = useRef(null);
  const videoElsRef = useRef(new Map());
  const reelsRef = useRef(reels);
  const activeRef = useRef(activeIndex);
  const mutedRef = useRef(muted);
  const userPausedRef = useRef(userPaused);
  const aliveRef = useRef(true);
  const pendingLikes = useRef(new Set());
  const reportedRef = useRef(new Set());
  const lastSheet = useRef(null);
  const seekingRef = useRef(false);
  const timers = useRef({ toast: null, pulse: null, burst: null, retry: null });

  // pagination bookkeeping (refs: read synchronously, never stale)
  const fetchingRef = useRef(false);
  const pageRef = useRef(0);
  const cursorRef = useRef(null);
  const hasMoreRef = useRef(true);
  const cooldownRef = useRef(0);

  // seen-event batching
  const seenSentRef = useRef(new Set());
  const seenQueueRef = useRef([]);
  const seenTimerRef = useRef(null);

  // gesture bookkeeping
  const g = useRef({ id: null, x: 0, y: 0, moved: false, holding: false, lastTap: 0, tapTimer: null, holdTimer: null }).current;

  reelsRef.current = reels;
  activeRef.current = activeIndex;
  mutedRef.current = muted;
  userPausedRef.current = userPaused;

  /* ---------- seen batching (every 3s or 10 events) ---------- */

  const flushSeen = useCallback(() => {
    clearTimeout(seenTimerRef.current);
    seenTimerRef.current = null;
    const events = seenQueueRef.current.splice(0, 50);
    if (events.length === 0) return;
    api(API.seen, { method: 'POST', body: JSON.stringify({ events }) }).catch(() => {
      /* seen tracking is best-effort */
    });
    if (seenQueueRef.current.length > 0) seenTimerRef.current = setTimeout(flushSeen, SEEN_FLUSH_MS);
  }, []);

  const queueSeen = useCallback(
    (reel) => {
      const key = `${reel.platform}:${reel.id}`;
      if (seenSentRef.current.has(key)) return;
      seenSentRef.current.add(key);
      seenQueueRef.current.push({
        contentId: String(reel.id).replace(/^ig_/, ''),
        platform: reel.platform === 'instagram' ? 2 : 1,
      });
      if (seenQueueRef.current.length >= SEEN_FLUSH_COUNT) flushSeen();
      else if (!seenTimerRef.current) seenTimerRef.current = setTimeout(flushSeen, SEEN_FLUSH_MS);
    },
    [flushSeen]
  );

  useEffect(() => {
    aliveRef.current = true;
    document.documentElement.classList.add('rf-body');
    document.body.classList.add('rf-body');
    addPreconnect('https://www.youtube.com');
    addPreconnect('https://i.ytimg.com');
    addPreconnect('https://www.google.com');
    ensureExtraStyles();
    ensureYT(); // start downloading the player API before the first reel needs it
    const onHide = () => {
      if (document.hidden) flushSeen();
    };
    document.addEventListener('visibilitychange', onHide);
    const t = timers.current;
    return () => {
      aliveRef.current = false;
      document.removeEventListener('visibilitychange', onHide);
      flushSeen();
      document.documentElement.classList.remove('rf-body');
      document.body.classList.remove('rf-body');
      clearTimeout(t.toast);
      clearTimeout(t.pulse);
      clearTimeout(t.burst);
      clearTimeout(t.retry);
      clearTimeout(g.tapTimer);
      clearTimeout(g.holdTimer);
    };
  }, [g, flushSeen]);

  const showToast = useCallback((message) => {
    setToast(message);
    clearTimeout(timers.current.toast);
    timers.current.toast = setTimeout(() => setToast(''), 2600);
  }, []);

  /* ---------- data loading ---------- */

  const loadPage = useCallback(async (initial) => {
    if (fetchingRef.current) return;
    if (!initial && (!hasMoreRef.current || Date.now() < cooldownRef.current)) return;
    fetchingRef.current = true;
    if (initial) {
      pageRef.current = 0;
      cursorRef.current = null;
      hasMoreRef.current = true;
      setStatus('loading');
    }
    const pageNum = initial ? 1 : pageRef.current + 1;
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (!initial && cursorRef.current) params.set('cursor', String(cursorRef.current));
    else params.set('page', String(pageNum));

    try {
      const payload = await api(`${API.list}?${params.toString()}`);
      if (!aliveRef.current) return;
      const rawItems = unwrapList(payload);
      const items = rawItems.map(normalizeReel).filter(Boolean);

      setReels((prev) => {
        if (initial) return items;
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...items.filter((r) => !seen.has(r.id))];
      });
      if (initial) {
        items.slice(0, 3).forEach((r) => {
          if (!r.thumb) return;
          const im = new Image();
          im.src = r.thumb;
        });
      }

      pageRef.current = pageNum;
      const meta = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
      if (meta.nextCursor !== undefined) {
        cursorRef.current = meta.nextCursor || null;
        hasMoreRef.current = Boolean(meta.nextCursor);
      } else if (meta.totalPages != null && Number.isFinite(Number(meta.totalPages))) {
        hasMoreRef.current = pageNum < Number(meta.totalPages);
      } else if (typeof meta.hasMore === 'boolean') {
        hasMoreRef.current = meta.hasMore;
      } else {
        hasMoreRef.current = rawItems.length >= PAGE_SIZE;
      }
      cooldownRef.current = 0;
      if (initial) setStatus('ready');
    } catch (err) {
      if (!aliveRef.current) return;
      if (initial) {
        setStatus('error');
      } else {
        // Do NOT skip the page: pageRef is only advanced on success.
        cooldownRef.current = Date.now() + RETRY_COOLDOWN_MS;
        clearTimeout(timers.current.retry);
        timers.current.retry = setTimeout(() => {
          if (aliveRef.current && activeRef.current >= reelsRef.current.length - PREFETCH_REMAINING) loadPage(false);
        }, RETRY_COOLDOWN_MS + 50);
      }
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadPage(true);
  }, [loadPage]);

  useEffect(() => {
    if (status !== 'ready') return;
    if (activeIndex >= reels.length - PREFETCH_REMAINING) loadPage(false);
  }, [status, activeIndex, reels.length, loadPage]);

  const retryInitialLoad = useCallback(() => {
    fetchingRef.current = false;
    loadPage(true);
  }, [loadPage]);

  const patchReel = useCallback((id, patch) => {
    setReels((prev) => prev.map((r) => (r.id === id ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)));
  }, []);

  // A blocked / private / deleted video: drop it and tell the backend (optional endpoint).
  const onBadReel = useCallback((id) => {
    setReels((prev) => prev.filter((r) => r.id !== id));
    if (!reportedRef.current.has(id)) {
      reportedRef.current.add(id);
      api(API.unavailable(id), { method: 'POST', body: JSON.stringify({ reason: 'unavailable' }) }).catch(() => {});
    }
  }, []);

  const registerVideo = useCallback((id, el) => {
    if (el) videoElsRef.current.set(id, el);
    else videoElsRef.current.delete(id);
  }, []);

  /* ---------- active slide detection (no debounce) ---------- */

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || reels.length === 0 || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        let best = null;
        entries.forEach((en) => {
          if (en.isIntersecting && en.intersectionRatio >= ACTIVE_THRESHOLD && (!best || en.intersectionRatio > best.intersectionRatio)) best = en;
        });
        if (best) {
          const idx = Number(best.target.dataset.index);
          if (!Number.isNaN(idx)) setActiveIndex(idx);
        }
      },
      { root, threshold: [ACTIVE_THRESHOLD, 0.75, 1] }
    );
    root.querySelectorAll('[data-index]').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [reels.length]);

  useEffect(() => {
    if (reels.length > 0 && activeIndex > reels.length - 1) setActiveIndex(reels.length - 1);
  }, [reels.length, activeIndex]);

  // New reel: reset progress + un-pause.
  useEffect(() => {
    setUserPaused(false);
    const fill = fillRef.current;
    if (fill) {
      fill.style.transition = 'none';
      fill.style.transform = 'scaleX(0)';
      requestAnimationFrame(() => {
        if (fillRef.current) fillRef.current.style.transition = '';
      });
    }
  }, [activeIndex]);

  // Seen tracking for the active reel (batched).
  useEffect(() => {
    const current = reels[activeIndex];
    if (current) queueSeen(current);
  }, [activeIndex, reels, queueSeen]);

  // Progress bar (reads the active <video> or the pool, 4x per second, no React renders).
  useEffect(() => {
    if (status !== 'ready') return undefined;
    const timer = setInterval(() => {
      if (seekingRef.current || document.hidden) return;
      const current = reelsRef.current[activeRef.current];
      const el = current ? videoElsRef.current.get(current.id) : null;
      let p = null;
      if (el) p = el.duration > 0 ? el.currentTime / el.duration : null;
      else if (poolApiRef.current) p = poolApiRef.current.getProgress();
      if (p !== null && fillRef.current) fillRef.current.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`;
    }, 250);
    return () => clearInterval(timer);
  }, [status]);

  /* ---------- navigation ---------- */

  const scrollToIndex = useCallback((index, behavior) => {
    const root = scrollerRef.current;
    if (!root) return;
    const node = root.querySelector(`[data-index="${index}"]`);
    if (node) node.scrollIntoView({ behavior, block: 'start' });
  }, []);

  const go = useCallback(
    (delta) => {
      const next = Math.min(Math.max(activeRef.current + delta, 0), reelsRef.current.length - 1);
      scrollToIndex(next, 'smooth');
    },
    [scrollToIndex]
  );

  const selectReelById = useCallback(
    (id) => {
      const idx = reelsRef.current.findIndex((r) => r.id === id);
      if (idx !== -1) scrollToIndex(idx, 'auto'); // instant: no mounting of every slide in between
    },
    [scrollToIndex]
  );

  /* ---------- actions ---------- */

  const showPulse = useCallback((kind) => {
    setPulse({ kind, key: Date.now() });
    clearTimeout(timers.current.pulse);
    timers.current.pulse = setTimeout(() => setPulse(null), 800);
  }, []);

  // Speaker button / "m" key: sound only.
  const toggleMute = useCallback(
    (withPulse) => {
      const next = !mutedRef.current;
      setMuted(next);
      if (withPulse) showPulse(next ? 'muted' : 'sound');
    },
    [showPulse]
  );

  // Single tap on the video: sound + play together, or pause + mute together.
  const onSingleTap = useCallback(() => {
    if (userPausedRef.current) {
      // paused -> play with sound
      setUserPaused(false);
      setMuted(false);
      showPulse('play');
    } else if (mutedRef.current) {
      // playing muted -> sound on
      setMuted(false);
      showPulse('sound');
    } else {
      // playing with sound -> pause + mute
      setUserPaused(true);
      setMuted(true);
      showPulse('pause');
    }
  }, [showPulse]);

  const toggleLike = useCallback(
    async (id, forceOn = false) => {
      const current = reelsRef.current.find((r) => r.id === id);
      if (!current || pendingLikes.current.has(id)) return;
      const next = forceOn ? true : !current.liked;
      if (next === current.liked) return;
      const delta = next ? 1 : -1;
      pendingLikes.current.add(id);
      patchReel(id, (r) => ({ liked: next, likes: Math.max(0, r.likes + delta) }));
      try {
        await api(API.like(id), { method: 'POST', body: JSON.stringify({ liked: next }) });
      } catch (err) {
        // Roll back so the UI never shows a like that the server does not have.
        patchReel(id, (r) => ({ liked: !next, likes: Math.max(0, r.likes - delta) }));
        showToast(err && (err.status === 401 || err.status === 403) ? 'Log in to like Reels.' : "Couldn't save your like. Try again.");
      } finally {
        pendingLikes.current.delete(id);
      }
    },
    [patchReel, showToast]
  );

  const onLike = useCallback((id) => toggleLike(id, false), [toggleLike]);

  const onShare = useCallback((id) => {
    const r = reelsRef.current.find((x) => x.id === id);
    if (!r) return;
    const url = r.shareUrl || (r.videoId ? `https://www.youtube.com/shorts/${r.videoId}` : window.location.href);
    const text = `${titleOf(r)}\n${url}`;
    if (navigator.share) {
      navigator.share({ title: titleOf(r), text, url }).catch(() => {});
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }, []);

  const onToggleFollow = useCallback((key) => {
    setFollows((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      writeStore(SUBS_KEY, next);
      return next;
    });
  }, []);

  const onToggleBookmark = useCallback((id) => {
    setBookmarks((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      writeStore(BOOKMARKS_KEY, next);
      return next;
    });
  }, []);

  const onForceMute = useCallback(() => {
    setMuted(true);
    showToast('Tap the speaker to turn sound on.');
  }, [showToast]);

  const onPlayerFail = useCallback(() => showToast("Video player couldn't load. Check your connection."), [showToast]);

  const onCountDelta = useCallback((id, delta) => patchReel(id, (r) => ({ comments: Math.max(0, r.comments + delta) })), [patchReel]);

  const openComments = useCallback(
    (id) => {
      const r = reelsRef.current.find((x) => x.id === id);
      if (r && r.platform === 'instagram') {
        showToast('Comments are not available for Instagram reels.');
        return;
      }
      setSheet({ type: 'comments', id });
    },
    [showToast]
  );
  const openDetails = useCallback((id) => setSheet({ type: 'details', id }), []);
  const openChannel = useCallback((reel) => {
    if (reel && reel.platform === 'instagram') {
      const url = reel.profileUrl || reel.shareUrl;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (reel && reel.channelId) {
      window.location.assign(`/shorts/channel/${reel.channelId}`);
      return;
    }
    setSheet({
      type: 'channel',
      channelId: reel.channelId,
      channelName: reel.channelName,
      channelLogo: reel.channelLogo,
      channelHandle: reel.channelHandle,
      verified: reel.verified,
      subscribers: reel.subscribers,
    });
  }, []);
  const closeSheet = useCallback(() => setSheet(null), []);

  /* ---------- gestures: tap = sound + play/pause, double tap = like, hold = pause ---------- */

  const endHold = useCallback(() => {
    if (g.holding) {
      g.holding = false;
      setHolding(false);
    }
  }, [g]);

  const onTapDown = useCallback(
    (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      g.id = e.pointerId;
      g.x = e.clientX;
      g.y = e.clientY;
      g.moved = false;
      g.holding = false;
      clearTimeout(g.holdTimer);
      g.holdTimer = setTimeout(() => {
        if (g.id === null || g.moved) return;
        g.holding = true;
        setHolding(true);
      }, HOLD_MS);
    },
    [g]
  );

  const onTapMove = useCallback(
    (e) => {
      if (g.id !== e.pointerId) return;
      if (Math.abs(e.clientX - g.x) > MOVE_SLOP || Math.abs(e.clientY - g.y) > MOVE_SLOP) {
        g.moved = true;
        clearTimeout(g.holdTimer);
        endHold();
      }
    },
    [g, endHold]
  );

  const onTapUp = useCallback(
    (e) => {
      if (g.id !== e.pointerId) return;
      g.id = null;
      clearTimeout(g.holdTimer);
      if (g.holding) {
        endHold();
        return;
      }
      if (g.moved) return; // it was a drag, not a tap
      const now = Date.now();
      if (now - g.lastTap < DOUBLE_TAP_MS) {
        clearTimeout(g.tapTimer);
        g.lastTap = 0;
        const reel = reelsRef.current[activeRef.current];
        if (reel) toggleLike(reel.id, true);
        setBurst({ x: e.clientX, y: e.clientY, key: now });
        clearTimeout(timers.current.burst);
        timers.current.burst = setTimeout(() => setBurst(null), 900);
        return;
      }
      g.lastTap = now;
      clearTimeout(g.tapTimer);
      g.tapTimer = setTimeout(() => {
        g.lastTap = 0;
        onSingleTap();
      }, DOUBLE_TAP_MS);
    },
    [g, endHold, toggleLike, onSingleTap]
  );

  // The browser takes over for scrolling -> pointercancel. Never a tap.
  const onTapCancel = useCallback(() => {
    g.id = null;
    g.moved = true;
    clearTimeout(g.holdTimer);
    endHold();
  }, [g, endHold]);

  /* ---------- seek bar ---------- */

  const ratioFromEvent = (e) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };
  const onSeekDown = (e) => {
    seekingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${ratioFromEvent(e)})`;
  };
  const onSeekMove = (e) => {
    if (seekingRef.current && fillRef.current) fillRef.current.style.transform = `scaleX(${ratioFromEvent(e)})`;
  };
  const onSeekUp = (e) => {
    if (!seekingRef.current) return;
    seekingRef.current = false;
    const ratio = ratioFromEvent(e);
    const current = reelsRef.current[activeRef.current];
    const el = current ? videoElsRef.current.get(current.id) : null;
    if (el) {
      if (el.duration > 0) el.currentTime = ratio * el.duration;
    } else if (poolApiRef.current) {
      poolApiRef.current.seekTo(ratio);
    }
  };
  const onSeekCancel = () => {
    seekingRef.current = false;
  };

  /* ---------- keyboard ---------- */

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        setSheet(null);
        return;
      }
      if (sheet) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        go(-1);
      } else if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey) {
        toggleMute(true);
      } else if (e.key === ' ' && tag !== 'BUTTON') {
        e.preventDefault();
        setUserPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, go, toggleMute]);

  /* ---------- render ---------- */

  if (sheet) lastSheet.current = sheet;
  const sheetData = sheet || lastSheet.current || {};
  const sheetReel = sheetData.id ? reels.find((r) => r.id === sheetData.id) || null : null;

  const ready = status === 'ready' && reels.length > 0;
  const activeReel = reels[activeIndex] || reels[0];
  const sheetOpen = Boolean(sheet);
  const pausedNow = holding || userPaused;

  return (
    <main className="rf-root" aria-label="Reels">
      <div className={`rf-chrome${holding ? ' is-hidden' : ''}`}>
        <div className="rf-chrome-left">
          <button type="button" className="rf-glass-btn" onClick={goBack} aria-label="Go back">
            <BackIcon />
          </button>
          <span className="rf-chrome-title">Reels</span>
        </div>
        {ready && (
          <button type="button" className="rf-glass-btn" onClick={() => toggleMute(false)} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} aria-pressed={!muted}>
            <VolumeIcon muted={muted} />
          </button>
        )}
      </div>

      {status === 'loading' && <Skeleton />}
      {status === 'error' && <StateCard title="Couldn't load Reels" body="Check your connection and try again." actionLabel="Try again" onAction={retryInitialLoad} />}
      {status === 'ready' && reels.length === 0 && <StateCard title="No Reels yet" body="New videos will show up here once they're published." />}

      {ready && (
        <>
          {activeReel.thumb ? (
            <div className="rf-ambient" aria-hidden="true" style={{ backgroundImage: `url(${JSON.stringify(activeReel.thumb)})` }} />
          ) : null}
          <div className="rf-scroller" ref={scrollerRef}>
            <PlayerPool
              reels={reels}
              activeIndex={activeIndex}
              muted={muted}
              paused={pausedNow}
              onBad={onBadReel}
              onForceMute={onForceMute}
              onPlayerFail={onPlayerFail}
              apiRef={poolApiRef}
            />
            {reels.map((r, i) => (
              <ReelSlide
                key={r.id}
                reel={r}
                index={i}
                light={Math.abs(i - activeIndex) > RENDER_WINDOW}
                isActive={i === activeIndex}
                nearVideo={Math.abs(i - activeIndex) <= VIDEO_WINDOW}
                muted={muted}
                paused={pausedNow}
                uiHidden={holding && i === activeIndex}
                following={Boolean(follows[r.channelId || r.channelName])}
                bookmarked={Boolean(bookmarks[r.id])}
                registerVideo={registerVideo}
                onForceMute={onForceMute}
                onBad={onBadReel}
                onLike={onLike}
                onOpenComments={openComments}
                onOpenDetails={openDetails}
                onOpenChannel={openChannel}
                onShare={onShare}
                onToggleFollow={onToggleFollow}
                onToggleBookmark={onToggleBookmark}
                onTapDown={onTapDown}
                onTapMove={onTapMove}
                onTapUp={onTapUp}
                onTapCancel={onTapCancel}
              />
            ))}
          </div>

          <div
            ref={trackRef}
            className={`rf-progress${holding ? ' is-hidden' : ''}`}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={100}
            tabIndex={-1}
            onPointerDown={onSeekDown}
            onPointerMove={onSeekMove}
            onPointerUp={onSeekUp}
            onPointerCancel={onSeekCancel}
          >
            <div className="rf-progress-track" />
            <div ref={fillRef} className="rf-progress-fill" />
          </div>

          <div className="rf-nav">
            <button type="button" className="rf-glass-btn rf-glass-btn--lg" onClick={() => go(-1)} disabled={activeIndex === 0} aria-label="Previous reel">
              <ChevronIcon up />
            </button>
            <button type="button" className="rf-glass-btn rf-glass-btn--lg" onClick={() => go(1)} disabled={activeIndex >= reels.length - 1} aria-label="Next reel">
              <ChevronIcon />
            </button>
          </div>

          {pulse && (
            <div key={pulse.key} className="rf-pulse" aria-hidden="true">
              {pulse.kind === 'pause' && <PauseIcon size={34} />}
              {pulse.kind === 'play' && <PlayIcon size={34} />}
              {(pulse.kind === 'sound' || pulse.kind === 'muted') && <VolumeIcon muted={pulse.kind === 'muted'} size={34} />}
            </div>
          )}
          {burst && (
            <span key={burst.key} className="rf-burst" style={{ left: burst.x, top: burst.y }} aria-hidden="true">
              <HeartIcon filled />
              <i className="rf-particle p1" />
              <i className="rf-particle p2" />
              <i className="rf-particle p3" />
              <i className="rf-particle p4" />
              <i className="rf-particle p5" />
              <i className="rf-particle p6" />
            </span>
          )}

          <CommentsSheet reel={sheetReel} open={sheetOpen && sheet.type === 'comments'} onClose={closeSheet} onCountDelta={onCountDelta} />
          <DetailsSheet
            reel={sheetReel}
            open={sheetOpen && sheet.type === 'details'}
            onClose={closeSheet}
            onOpenChannel={openChannel}
            following={sheetReel ? Boolean(follows[sheetReel.channelId || sheetReel.channelName]) : false}
            onToggleFollow={onToggleFollow}
          />
          <ChannelProfileSheet
            channelId={sheetData.channelId}
            channelName={sheetData.channelName}
            channelLogo={sheetData.channelLogo}
            channelHandle={sheetData.channelHandle}
            verified={sheetData.verified}
            subscribers={sheetData.subscribers}
            open={sheetOpen && sheet.type === 'channel'}
            onClose={closeSheet}
            following={Boolean(follows[sheetData.channelId || sheetData.channelName])}
            onToggleFollow={onToggleFollow}
            onSelectReel={selectReelById}
          />
        </>
      )}

      <div className={`rf-toast${toast ? ' is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </main>
  );
}

export default function ReelsFeed() {
  return (
    <FeedErrorBoundary>
      <ReelsFeedInner />
    </FeedErrorBoundary>
  );
}

export {
  HeartIcon,
  CommentIcon,
  ShareIcon,
  BookmarkIcon,
  MoreIcon,
  BackIcon,
  VolumeIcon,
  PauseIcon,
  PlayIcon,
  CloseIcon,
  SendIcon,
  ChevronIcon,
  VerifiedBadge,
  Avatar,
  RailButton,
  StateCard,
  Skeleton,
  Sheet,
  CommentsSheet,
  DetailsSheet,
  ChannelProfileSheet,
  PlayerPool,
  NativeVideo,
  CroppedEmbed,
};