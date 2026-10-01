import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  HeartIcon,
  CommentIcon,
  ShareIcon,
  BookmarkIcon,
  MoreIcon,
  BackIcon,
  VolumeIcon,
  Avatar,
  StateCard,
  Skeleton,
  CommentsSheet,
  DetailsSheet,
  titleOf,
  nameOf,
  formatCount,
  shouldStartMuted,
  addPreconnect,
  ensureYT,
  PlayerPool,
  normalizeReel,
} from '../Shorts/ShortsFeed';
// Imported AFTER ShortsFeed so these (scoped) rules always win over the shared feed styles.
import './ChannelShorts.css';

/* ---------------------------------------------------------------------------
 * ChannelShorts - dedicated page for one channel's shorts
 *
 *  - Tap anywhere: video + audio pause / resume (no icon in the middle)
 *  - Double tap: like (heart burst)      - Press & hold: temporary pause
 *  - Clean video: no caption / description / channel overlay on the picture
 *  - Cursor pagination (matches the updated backend), prefetch before the end
 *  - Next posters are pre-decoded so swipes never show an empty frame
 * ------------------------------------------------------------------------- */

const API_BASE = (process.env.REACT_APP_API_URL || '').replace(/\/+$/, '');
const API = {
  listChannelShorts: (channelId, cursor, limit) =>
    `/api/shorts/channel/${encodeURIComponent(channelId)}?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  channel: (id) => `/api/channels/${encodeURIComponent(id)}`,
  like: (id) => `/api/shorts/${encodeURIComponent(id)}/like`,
  unavailable: (id) => `/api/shorts/${encodeURIComponent(id)}/unavailable`,
};
const SUBS_KEY = 'rcm_reels_follows';
const BOOKMARKS_KEY = 'rcm_reels_bookmarks';

const ACTIVE_THRESHOLD = 0.5;
const HOLD_MS = 220;
const DOUBLE_TAP_MS = 260;
const MOVE_SLOP = 10;
const PAGE_SIZE = 10;
const PREFETCH_REMAINING = 5;
const RENDER_WINDOW = 2;
const POSTER_PRELOAD = 3;
const FETCH_TIMEOUT_MS = 15000;
const RETRY_COOLDOWN_MS = 4000;

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

function unwrapList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const keys = ['shorts', 'reels', 'data', 'items', 'results'];
    for (let i = 0; i < keys.length; i += 1) {
      if (Array.isArray(payload[keys[i]])) return payload[keys[i]];
    }
  }
  return [];
}

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

/* ---------- small presentational pieces ---------- */

function ActionButton({ label, caption, active, tone, onClick, children }) {
  return (
    <button
      type="button"
      className={`cs-act${active ? ' is-on' : ''}${tone ? ` cs-act--${tone}` : ''}`}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : Boolean(active)}
      onClick={onClick}
    >
      <span className="cs-act-icon">{children}</span>
      {caption ? <span className="cs-act-cap">{caption}</span> : null}
    </button>
  );
}

const ReelSlide = React.memo(function ReelSlide({
  reel,
  index,
  light,
  isActive,
  uiHidden,
  bookmarked,
  onLike,
  onOpenComments,
  onOpenDetails,
  onShare,
  onToggleBookmark,
  onTapDown,
  onTapMove,
  onTapUp,
  onTapCancel,
}) {
  if (light) {
    return (
      <section className="rf-slide" data-index={index} aria-hidden="true">
        <div className="rf-stage" />
      </section>
    );
  }

  return (
    <section className={`rf-slide${isActive ? ' is-active' : ''}`} data-index={index} aria-label={titleOf(reel)}>
      <div className="rf-stage">
        <img
          className="rf-poster"
          src={reel.thumb}
          alt=""
          draggable="false"
          decoding="async"
          onError={(e) => {
            const img = e.currentTarget;
            const fallback = `https://i.ytimg.com/vi/${reel.videoId}/hqdefault.jpg`;
            if (img.src !== fallback && !img.dataset.fb) {
              img.dataset.fb = '1';
              img.src = fallback;
            }
          }}
        />

        {isActive && (
          <div
            className="rf-tap"
            onPointerDown={onTapDown}
            onPointerMove={onTapMove}
            onPointerUp={onTapUp}
            onPointerCancel={onTapCancel}
            onContextMenu={(e) => e.preventDefault()}
          />
        )}

        <div className={`cs-hideable${uiHidden ? ' is-hidden' : ''}`}>
          <div className="cs-rail" role="group" aria-label="Actions">
            <ActionButton label={reel.liked ? 'Unlike' : 'Like'} caption={formatCount(reel.likes)} active={reel.liked} tone="like" onClick={() => onLike(reel.id)}>
              <HeartIcon filled={reel.liked} />
            </ActionButton>
            <ActionButton label="Open comments" caption={formatCount(reel.comments)} onClick={() => onOpenComments(reel.id)}>
              <CommentIcon />
            </ActionButton>
            <ActionButton label="Share" caption="Share" onClick={() => onShare(reel.id)}>
              <ShareIcon />
            </ActionButton>
            <ActionButton label="Save" active={bookmarked} tone="save" onClick={() => onToggleBookmark(reel.id)}>
              <BookmarkIcon filled={bookmarked} />
            </ActionButton>
            <ActionButton label="Show details" onClick={() => onOpenDetails(reel.id)}>
              <MoreIcon />
            </ActionButton>
          </div>
        </div>
      </div>
    </section>
  );
});

/* ---------- page ---------- */

function ChannelShorts() {
  const { channelId } = useParams();
  const navigate = useNavigate();

  const [reels, setReels] = useState([]);
  const [status, setStatus] = useState('loading');
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(shouldStartMuted);
  const [holding, setHolding] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const [follows, setFollows] = useState(() => readStore(SUBS_KEY));
  const [bookmarks, setBookmarks] = useState(() => readStore(BOOKMARKS_KEY));
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState('');
  const [burst, setBurst] = useState(null);
  const [channelInfo, setChannelInfo] = useState(null);

  const scrollerRef = useRef(null);
  const fillRef = useRef(null);
  const trackRef = useRef(null);
  const poolApiRef = useRef(null);
  const reelsRef = useRef(reels);
  const activeRef = useRef(activeIndex);
  const mutedRef = useRef(muted);
  const userMutedRef = useRef(false); // true only if the USER chose mute (not autoplay policy)
  const aliveRef = useRef(true);
  const pendingLikes = useRef(new Set());
  const reportedRef = useRef(new Set());
  const lastSheet = useRef(null);
  const seekingRef = useRef(false);
  const timers = useRef({ toast: null, burst: null, retry: null }).current;

  // pagination bookkeeping (cursor based)
  const fetchingRef = useRef(false);
  const cursorRef = useRef(null);
  const hasMoreRef = useRef(true);
  const cooldownRef = useRef(0);
  const epochRef = useRef(0);
  const abortRef = useRef(null);

  // gesture bookkeeping
  const g = useRef({ id: null, x: 0, y: 0, moved: false, holding: false, lastTap: 0, holdTimer: null }).current;

  reelsRef.current = reels;
  activeRef.current = activeIndex;
  mutedRef.current = muted;

  useEffect(() => {
    aliveRef.current = true;
    document.documentElement.classList.add('rf-body');
    document.body.classList.add('rf-body');
    addPreconnect('https://www.youtube.com');
    addPreconnect('https://i.ytimg.com');
    addPreconnect('https://www.google.com');
    ensureYT();
    return () => {
      aliveRef.current = false;
      if (abortRef.current) abortRef.current.abort();
      document.documentElement.classList.remove('rf-body');
      document.body.classList.remove('rf-body');
      clearTimeout(timers.toast);
      clearTimeout(timers.burst);
      clearTimeout(timers.retry);
      clearTimeout(g.holdTimer);
    };
  }, [g, timers]);

  const showToast = useCallback((message) => {
    setToast(message);
    clearTimeout(timers.toast);
    timers.toast = setTimeout(() => setToast(''), 2600);
  }, [timers]);

  /* pause everything while the tab is hidden */
  useEffect(() => {
    const onVis = () => setPageHidden(document.visibilityState !== 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  /* the first real tap/click lets the browser play with sound (autoplay policy) */
  useEffect(() => {
    const unlock = () => {
      if (mutedRef.current && !userMutedRef.current) setMuted(false);
    };
    window.addEventListener('pointerup', unlock, true);
    return () => window.removeEventListener('pointerup', unlock, true);
  }, []);

  /* ---------- channel header info ---------- */

  useEffect(() => {
    const ctl = new AbortController();
    setChannelInfo(null);
    api(API.channel(channelId), { signal: ctl.signal })
      .then((p) => {
        if (p && aliveRef.current) setChannelInfo(p.data || p.channel || null);
      })
      .catch(() => {});
    return () => ctl.abort();
  }, [channelId]);

  /* ---------- data loading ---------- */

  const loadPage = useCallback(
    async (initial) => {
      if (initial) {
        if (abortRef.current) abortRef.current.abort();
        epochRef.current += 1;
        fetchingRef.current = false;
        cursorRef.current = null;
        hasMoreRef.current = true;
        cooldownRef.current = 0;
        setStatus('loading');
      } else if (fetchingRef.current || !hasMoreRef.current || Date.now() < cooldownRef.current) {
        return;
      }

      fetchingRef.current = true;
      const epoch = epochRef.current;
      const ctl = new AbortController();
      abortRef.current = ctl;

      try {
        const payload = await api(API.listChannelShorts(channelId, cursorRef.current, PAGE_SIZE), { signal: ctl.signal });
        if (!aliveRef.current || epoch !== epochRef.current) return;

        const items = unwrapList(payload).map(normalizeReel).filter(Boolean);
        setReels((prev) => {
          if (initial) return items;
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...items.filter((r) => !seen.has(r.id))];
        });

        // warm the first posters so the page opens instantly
        if (initial) {
          items.slice(0, POSTER_PRELOAD).forEach((r) => {
            const im = new Image();
            im.src = r.thumb;
          });
        }

        const meta = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
        cursorRef.current = meta.nextCursor || null;
        hasMoreRef.current = Boolean(meta.hasMore) && Boolean(meta.nextCursor);
        cooldownRef.current = 0;
        if (initial) setStatus('ready');
      } catch (err) {
        if (!aliveRef.current || epoch !== epochRef.current || (err && err.name === 'AbortError')) return;
        if (initial) {
          setStatus('error');
        } else {
          cooldownRef.current = Date.now() + RETRY_COOLDOWN_MS;
          clearTimeout(timers.retry);
          timers.retry = setTimeout(() => {
            if (aliveRef.current && activeRef.current >= reelsRef.current.length - PREFETCH_REMAINING) loadPage(false);
          }, RETRY_COOLDOWN_MS + 50);
        }
      } finally {
        if (epoch === epochRef.current) fetchingRef.current = false;
      }
    },
    [channelId, timers]
  );

  useEffect(() => {
    setActiveIndex(0);
    setReels([]);
    loadPage(true);
  }, [loadPage]);

  useEffect(() => {
    if (status !== 'ready') return;
    if (activeIndex >= reels.length - PREFETCH_REMAINING) loadPage(false);
  }, [status, activeIndex, reels.length, loadPage]);

  const retryInitialLoad = useCallback(() => loadPage(true), [loadPage]);

  /* pre-decode the next posters */
  useEffect(() => {
    for (let k = 1; k <= POSTER_PRELOAD; k += 1) {
      const r = reelsRef.current[activeIndex + k];
      if (r && r.thumb) {
        const im = new Image();
        im.decoding = 'async';
        im.src = r.thumb;
      }
    }
  }, [activeIndex, reels.length]);

  const patchReel = useCallback((id, patch) => {
    setReels((prev) => prev.map((r) => (r.id === id ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)));
  }, []);

  const onBadReel = useCallback((id) => {
    setReels((prev) => prev.filter((r) => r.id !== id));
    if (!reportedRef.current.has(id)) {
      reportedRef.current.add(id);
      api(API.unavailable(id), { method: 'POST', body: JSON.stringify({ reason: 'unavailable' }) }).catch(() => {});
    }
  }, []);

  /* ---------- active slide detection ---------- */

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

  /* new short -> start playing, reset progress */
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

  useEffect(() => {
    if (status !== 'ready') return undefined;
    const timer = setInterval(() => {
      if (seekingRef.current || document.hidden) return;
      const p = poolApiRef.current ? poolApiRef.current.getProgress() : null;
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

  /* ---------- actions ---------- */

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    userMutedRef.current = next;
    setMuted(next);
  }, []);

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
        const res = await api(API.like(id), { method: 'POST', body: JSON.stringify({ liked: next }) });
        // trust the server's truth (backend toggles atomically)
        if (res && typeof res.isLiked === 'boolean') {
          patchReel(id, (r) => ({
            liked: res.isLiked,
            likes: Number.isFinite(Number(res.likesCount)) ? Number(res.likesCount) : r.likes,
          }));
        }
      } catch (err) {
        patchReel(id, (r) => ({ liked: !next, likes: Math.max(0, r.likes - delta) }));
        showToast(err && (err.status === 401 || err.status === 403) ? 'Log in to like Shorts.' : "Couldn't save your like. Try again.");
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
    const url = `https://www.youtube.com/shorts/${r.videoId}`;
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
    setMuted(true); // autoplay policy, not a user choice -> next tap unmutes
    showToast('Tap anywhere for sound.');
  }, [showToast]);

  const onPlayerFail = useCallback(() => showToast("Video player couldn't load. Check your connection."), [showToast]);

  const onCountDelta = useCallback((id, delta) => patchReel(id, (r) => ({ comments: Math.max(0, r.comments + delta) })), [patchReel]);

  const openComments = useCallback((id) => setSheet({ type: 'comments', id }), []);
  const openDetails = useCallback((id) => setSheet({ type: 'details', id }), []);
  const openChannel = useCallback((reel) => navigate(`/shorts/channel/${reel.channelId}`), [navigate]);
  const closeSheet = useCallback(() => setSheet(null), []);

  /* ---------- gestures: tap = pause/resume, double tap = like, hold = pause ---------- */

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
      if (g.moved) return; // drag, not a tap

      const now = Date.now();
      if (now - g.lastTap < DOUBLE_TAP_MS) {
        // second tap: undo the instant pause-toggle of the first tap, then like
        g.lastTap = 0;
        setUserPaused((p) => !p);
        const reel = reelsRef.current[activeRef.current];
        if (reel) toggleLike(reel.id, true);
        setBurst({ x: e.clientX, y: e.clientY, key: now });
        clearTimeout(timers.burst);
        timers.burst = setTimeout(() => setBurst(null), 900);
        return;
      }

      // first tap acts IMMEDIATELY (no waiting for a possible double tap) -> feels instant
      g.lastTap = now;
      setUserPaused((p) => !p);
    },
    [g, endHold, toggleLike, timers]
  );

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
    if (poolApiRef.current) poolApiRef.current.seekTo(ratioFromEvent(e));
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
        toggleMute();
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
  const followKey = String((activeReel && activeReel.channelId) || (channelInfo && channelInfo.id) || channelId);
  const isFollowing = Boolean(follows[followKey]);

  return (
    <main className={`rf-root cs-root${userPaused ? ' is-paused' : ''}`} aria-label="Channel Shorts">
      <header className={`cs-chrome${holding ? ' is-hidden' : ''}`}>
        <button type="button" className="cs-glass" onClick={() => navigate(-1)} aria-label="Go back">
          <BackIcon />
        </button>

        <div className="cs-pill">
          {channelInfo ? (
            <>
              <span className="cs-pill-avatar">
                <Avatar name={channelInfo.name} src={channelInfo.logoUrl} />
              </span>
              <span className="cs-pill-text">
                <strong>{channelInfo.name}</strong>
                {channelInfo.subscriberCount > 0 && <small>{formatCount(channelInfo.subscriberCount)} subscribers</small>}
              </span>
              <button
                type="button"
                className={`cs-follow${isFollowing ? ' is-on' : ''}`}
                aria-pressed={isFollowing}
                onClick={() => onToggleFollow(followKey)}
              >
                {isFollowing ? 'Following' : 'Follow'}
              </button>
            </>
          ) : (
            <span className="cs-pill-text">
              <strong>Shorts</strong>
            </span>
          )}
        </div>

        {ready && (
          <button type="button" className="cs-glass" onClick={toggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} aria-pressed={!muted}>
            <VolumeIcon muted={muted} />
          </button>
        )}
      </header>

      {status === 'loading' && <Skeleton />}
      {status === 'error' && <StateCard title="Couldn't load Shorts" body="Check your connection and try again." actionLabel="Try again" onAction={retryInitialLoad} />}
      {status === 'ready' && reels.length === 0 && <StateCard title="No Shorts yet" body="New shorts will show up here once they're published." />}

      {ready && (
        <>
          <div className="rf-ambient" aria-hidden="true" style={{ backgroundImage: `url(${JSON.stringify(activeReel.thumb)})` }} />
          <div className="rf-scroller" ref={scrollerRef}>
            <PlayerPool
              reels={reels}
              activeIndex={activeIndex}
              muted={muted}
              paused={holding || userPaused || pageHidden}
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
                uiHidden={holding && i === activeIndex}
                bookmarked={Boolean(bookmarks[r.id])}
                onLike={onLike}
                onOpenComments={openComments}
                onOpenDetails={openDetails}
                onShare={onShare}
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
            className={`cs-progress${holding ? ' is-hidden' : ''}`}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={1}
            onPointerDown={onSeekDown}
            onPointerMove={onSeekMove}
            onPointerUp={onSeekUp}
            onPointerCancel={onSeekCancel}
          >
            <div className="cs-progress-track">
              <div ref={fillRef} className="cs-progress-fill" />
            </div>
          </div>
        </>
      )}

      {burst && (
        <div className="cs-burst" key={burst.key} style={{ left: burst.x, top: burst.y }} aria-hidden="true">
          <HeartIcon filled size={88} />
        </div>
      )}

      {sheetData.type === 'comments' && (
        <CommentsSheet reel={sheetReel} open={Boolean(sheet && sheet.type === 'comments')} onClose={closeSheet} onCountDelta={onCountDelta} />
      )}

      {sheetData.type === 'details' && (
        <DetailsSheet
          reel={sheetReel}
          open={Boolean(sheet && sheet.type === 'details')}
          onClose={closeSheet}
          onOpenChannel={openChannel}
          following={Boolean(follows[(sheetReel && (sheetReel.channelId || sheetReel.channelName)) || followKey])}
          onToggleFollow={onToggleFollow}
        />
      )}

      {toast && (
        <div className="cs-toast" key={toast} role="status">
          {toast}
        </div>
      )}
    </main>
  );
}

export default ChannelShorts;