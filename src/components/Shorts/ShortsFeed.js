import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './ShortsFeed.css';

/* ---------------------------------------------------------------------------
 * ReelsFeed — Apple-grade vertical video feed
 *
 * Self-contained: imports only React and its own stylesheet, so it can never
 * be part of an import cycle (the classic cause of a WEBPACK_DEFAULT_EXPORT
 * TDZ crash). Declared directly as the default export.
 *
 * Playback engine
 *   - The active slide, its 1 previous and its 2 next neighbours are mounted
 *     ("preload window"), so the player already exists and is buffering by
 *     the time you swipe to it — no black flash, no reload delay.
 *   - Every mounted player starts muted. A reconcile loop is the single
 *     source of truth: not-active => muted + paused; active => playing and
 *     unmuted only if the global sound toggle is on. Leaving a slide fires
 *     mute+pause in the same tick the slide stops being active, so a swipe
 *     can never leave two videos audible at once.
 * ------------------------------------------------------------------------- */

/* ---------- configuration ---------- */

const API_BASE = (process.env.REACT_APP_API_URL || '').replace(/\/+$/, '');
const API = {
  list: '/api/shorts',
  like: (id) => `/api/shorts/${encodeURIComponent(id)}/like`,
  comments: (id) => `/api/shorts/${encodeURIComponent(id)}/comments`,
};
const SUBS_KEY = 'rcm_reels_follows';
const BOOKMARKS_KEY = 'rcm_reels_bookmarks';
const ACTIVE_THRESHOLD = 0.65;
const HOLD_MS = 220; // press-and-hold threshold before we pause + hide the UI
const PRELOAD_BEHIND = 1;
const PRELOAD_AHEAD = 2;

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
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = new Error(`Request failed with status ${res.status} (${path})`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  const type = res.headers.get('content-type') || '';
  return type.includes('json') ? res.json() : null;
}

function unwrapList(payload) {
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

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
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

function extractHashtags(short) {
  const found = new Map();
  const add = (tag) => {
    const clean = String(tag).trim().replace(/^#+/, '').replace(/[.,;:!?)]+$/, '');
    if (clean) found.set(clean.toLowerCase(), clean);
  };
  const explicit = short.hashtags ?? short.tags ?? [];
  (Array.isArray(explicit) ? explicit : String(explicit).split(/[,\s]+/)).forEach(add);
  (String(short.description ?? '').match(/#[^\s#]+/g) || []).forEach(add);
  return Array.from(found.values());
}

function normalizeReel(short) {
  const videoId = extractVideoId(short);
  if (!videoId) return null;
  const channelObj = short.channel || {};
  return {
    id: String(short._id ?? short.id ?? videoId),
    videoId,
    title: short.title || 'Untitled reel',
    description: String(short.description ?? ''),
    thumb:
      short.thumbnail ??
      short.thumbnailUrl ??
      short.thumbnail_url ??
      channelObj.logoUrl ??
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    channelId: String(short.channelId ?? short.channel_id ?? channelObj.id ?? ''),
    channelName: short.channelName ?? short.channel_name ?? short.channelTitle ?? channelObj.name ?? 'Channel',
    channelLogo:
      short.channelLogo ??
      short.channel_logo ??
      short.channelAvatar ??
      channelObj.logo ??
      channelObj.avatar ??
      channelObj.logoUrl ??
      '',
    channelHandle: channelObj.handle ?? short.channelHandle ?? '',
    verified: Boolean(short.channelVerified ?? channelObj.verified ?? short.verified ?? false),
    subscribers: num(channelObj.subscriberCount ?? channelObj.subscribers ?? 0),
    likes: num(short.likesCount ?? short.likes_count ?? 0),
    comments: num(short.commentsCount ?? short.comments_count ?? 0),
    views: num(short.viewCount ?? short.view_count ?? short.views ?? 0),
    date: short.publishedAt ?? short.published_at ?? short.createdAt ?? short.created_at ?? null,
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

const titleOf = (r) => r.title || 'Untitled reel';
const nameOf = (r) => r.channelName || 'Channel';
const soundOf = (r) => `${nameOf(r)} · Original audio — ${titleOf(r)}`;

/* ---------- formatting ---------- */

const compactFormatter = (() => {
  try {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  } catch (e) {
    return null;
  }
})();

function formatCount(value) {
  const n = num(value);
  return compactFormatter ? compactFormatter.format(n) : String(n);
}

function formatDate(value) {
  if (!value) return 'Unknown';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function timeAgo(value) {
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

function hueFor(name) {
  let hash = 0;
  const str = String(name || '');
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) % 360;
  return hash;
}

function initialOf(name) {
  return (Array.from(String(name || '?').trim().replace(/^@+/, ''))[0] || '?').toUpperCase();
}

/* ---------- misc helpers ---------- */

function shouldStartMuted() {
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

// Every embed starts muted and playing (this is what makes preloading work —
// a mounted-but-inactive player is already buffering by the time it's swiped
// to). Only the reconcile loop in VideoLayer is ever allowed to unmute.
function buildEmbedSrc(videoId) {
  const params = new URLSearchParams({
    autoplay: '1',
    enablejsapi: '1',
    mute: '1',
    controls: '0',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    loop: '1',
    playlist: videoId,
    iv_load_policy: '3',
    disablekb: '1',
    fs: '0',
    origin: window.location.origin,
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
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
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
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

function InfoIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
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

function VolumeIcon({ muted }) {
  return (
    <Icon>
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

function PlayIcon() {
  return (
    <Icon size={30} fill="currentColor" stroke="none">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.78-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14z" />
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
    <svg className="rf-verified" viewBox="0 0 22 22" width="15" height="15" aria-hidden="true">
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
    <span
      className={`rf-avatar ${className}`}
      style={{ background: `hsl(${hueFor(name)}, 62%, 42%)` }}
      aria-hidden="true"
    >
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

function SoundDisc({ src, name, spinning }) {
  return (
    <div className={`rf-disc${spinning ? ' is-spinning' : ''}`} aria-hidden="true">
      <div className="rf-disc-ring" />
      <Avatar name={name} src={src} className="rf-disc-art" />
    </div>
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
    drag.current = { startY: e.clientY };
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
                <img src={r.thumb} alt="" loading="lazy" />
                <span className="rf-cp-views">{formatCount(r.views)} views</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
 * VideoLayer — the playback engine.
 * ------------------------------------------------------------------------- */

function VideoLayer({ reel, isActive, mounted, muted, onDoubleLike, onForceMute, onPlayStateChange, onHoldChange }) {
  const iframeRef = useRef(null);
  const fillRef = useRef(null);
  const trackRef = useRef(null);
  const stateRef = useRef(-1);
  const mutedInfoRef = useRef(true);
  const readyRef = useRef(false);
  const durationRef = useRef(0);
  const tapPausedRef = useRef(false);
  const holdPausedRef = useRef(false);
  const seekingRef = useRef(false);
  const unmuteTries = useRef(0);
  const lastMuteCmd = useRef(0);
  const lastPlayCmd = useRef(0);
  const lastTap = useRef(0);
  const tapTimer = useRef(null);
  const holdTimer = useRef(null);
  const burstTimer = useRef(null);
  const startPos = useRef(null);
  const flags = useRef({ isActive, muted });
  const onForceMuteRef = useRef(onForceMute);
  const onPlayStateRef = useRef(onPlayStateChange);
  const onHoldRef = useRef(onHoldChange);
  const [status, setStatus] = useState('loading');
  const [userPaused, setUserPaused] = useState(false);
  const [burst, setBurst] = useState(null);

  flags.current = { isActive, muted };
  onForceMuteRef.current = onForceMute;
  onPlayStateRef.current = onPlayStateChange;
  onHoldRef.current = onHoldChange;

  const src = useMemo(() => (mounted ? buildEmbedSrc(reel.videoId) : null), [mounted, reel.videoId]);

  const post = useCallback((func, args = []) => {
    const frame = iframeRef.current;
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    }
  }, []);

  const handshake = useCallback(() => {
    const frame = iframeRef.current;
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: reel.id, channel: 'widget' }), '*');
    }
  }, [reel.id]);

  const reconcile = useCallback(() => {
    const now = Date.now();
    const { isActive: active, muted: wantMuted } = flags.current;
    const state = stateRef.current;
    const shouldMute = !active || wantMuted;

    if (mutedInfoRef.current === shouldMute) {
      unmuteTries.current = 0;
    } else if (now - lastMuteCmd.current > 800) {
      lastMuteCmd.current = now;
      if (shouldMute) {
        post('mute');
      } else if (unmuteTries.current < 3) {
        unmuteTries.current += 1;
        post('unMute');
      } else {
        onForceMuteRef.current();
      }
    }

    const wantPlay = active && !tapPausedRef.current && !holdPausedRef.current && !seekingRef.current && !document.hidden;
    if (now - lastPlayCmd.current > 600) {
      if (wantPlay && (state === 2 || state === 5 || state === -1 || state === 0)) {
        lastPlayCmd.current = now;
        post('playVideo');
      } else if (!wantPlay && (state === 1 || state === 3)) {
        lastPlayCmd.current = now;
        post('pauseVideo');
      }
    }
  }, [post]);

  useEffect(() => {
    if (mounted) return;
    stateRef.current = -1;
    mutedInfoRef.current = true;
    readyRef.current = false;
    durationRef.current = 0;
    setStatus('loading');
    if (fillRef.current) fillRef.current.style.transform = 'scaleX(0)';
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return undefined;
    let heard = false;

    const onMessage = (e) => {
      const frame = iframeRef.current;
      if (!frame || e.source !== frame.contentWindow) return;
      let data = e.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (err) {
          return;
        }
      }
      if (!data) return;
      heard = true;
      readyRef.current = true;
      const info = data.info;
      if (data.event === 'onStateChange' && typeof info === 'number') stateRef.current = info;
      if (info && typeof info === 'object') {
        if (typeof info.playerState === 'number') stateRef.current = info.playerState;
        if (typeof info.muted === 'boolean') mutedInfoRef.current = info.muted;
        if (info.duration > 0) durationRef.current = info.duration;
        if (
          fillRef.current &&
          flags.current.isActive &&
          !seekingRef.current &&
          info.duration > 0 &&
          typeof info.currentTime === 'number'
        ) {
          const ratio = Math.min(1, Math.max(0, info.currentTime / info.duration));
          fillRef.current.style.transform = `scaleX(${ratio})`;
        }
      }
      if (stateRef.current === 1) {
        setStatus('playing');
        onPlayStateRef.current(true);
      } else if (stateRef.current === 2) {
        setStatus('paused');
        onPlayStateRef.current(false);
      }
      reconcile();
    };

    const onVisibility = () => reconcile();

    window.addEventListener('message', onMessage);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = setInterval(() => {
      if (heard) clearInterval(timer);
      else handshake();
    }, 400);

    return () => {
      window.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(timer);
    };
  }, [mounted, handshake, reconcile]);

  useEffect(() => {
    if (!isActive) {
      post('mute');
      post('pauseVideo');
      mutedInfoRef.current = true;
      tapPausedRef.current = false;
      holdPausedRef.current = false;
      unmuteTries.current = 0;
      setUserPaused(false);
      onPlayStateRef.current(false);
      return;
    }
    if (readyRef.current) post('seekTo', [0, true]);
    if (fillRef.current) fillRef.current.style.transform = 'scaleX(0)';
    tapPausedRef.current = false;
    holdPausedRef.current = false;
    lastMuteCmd.current = 0;
    lastPlayCmd.current = 0;
    unmuteTries.current = 0;
    setUserPaused(false);
    reconcile();
  }, [isActive, post, reconcile]);

  useEffect(() => {
    unmuteTries.current = 0;
    lastMuteCmd.current = 0;
    reconcile();
  }, [muted, reconcile]);

  useEffect(
    () => () => {
      clearTimeout(tapTimer.current);
      clearTimeout(holdTimer.current);
      clearTimeout(burstTimer.current);
    },
    []
  );

  /* ---- gestures: single tap = pause/resume, double tap = like, hold = pause + hide UI ---- */

  const beginHold = () => {
    holdPausedRef.current = true;
    onHoldRef.current(true);
    reconcile();
  };

  const endHold = () => {
    if (!holdPausedRef.current) return;
    holdPausedRef.current = false;
    onHoldRef.current(false);
    reconcile();
  };

  const togglePlay = () => {
    tapPausedRef.current = !tapPausedRef.current;
    setUserPaused(tapPausedRef.current);
    reconcile();
  };

  const handlePointerDown = (e) => {
    if (!isActive) return;
    startPos.current = { x: e.clientX, y: e.clientY };
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(beginHold, HOLD_MS);
  };

  const handlePointerMove = (e) => {
    if (!startPos.current) return;
    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    if (dx > 12 || dy > 12) clearTimeout(holdTimer.current);
  };

  const handlePointerUp = (e) => {
    if (!isActive) return;
    clearTimeout(holdTimer.current);
    const wasHolding = holdPausedRef.current;
    startPos.current = null;
    if (wasHolding) {
      endHold();
      return;
    }
    const now = Date.now();
    if (now - lastTap.current < 300) {
      clearTimeout(tapTimer.current);
      lastTap.current = 0;
      const rect = e.currentTarget.getBoundingClientRect();
      setBurst({ x: e.clientX - rect.left, y: e.clientY - rect.top, key: now });
      clearTimeout(burstTimer.current);
      burstTimer.current = setTimeout(() => setBurst(null), 900);
      onDoubleLike();
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(togglePlay, 300);
  };

  const handleKeyDown = (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      togglePlay();
    }
  };

  /* ---- drag-to-seek progress bar ---- */

  const seekFromEvent = (e) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${ratio})`;
    return ratio;
  };

  const handleSeekDown = (e) => {
    if (!isActive) return;
    seekingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromEvent(e);
  };
  const handleSeekMove = (e) => {
    if (!seekingRef.current) return;
    seekFromEvent(e);
  };
  const handleSeekUp = (e) => {
    if (!seekingRef.current) return;
    const ratio = seekFromEvent(e);
    seekingRef.current = false;
    if (durationRef.current > 0 && typeof ratio === 'number') post('seekTo', [ratio * durationRef.current, true]);
  };

  return (
    <div className="rf-video">
      {src && (
        <iframe
          ref={iframeRef}
          className="rf-iframe"
          src={src}
          onLoad={handshake}
          title={titleOf(reel)}
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
      <img className={`rf-poster${status === 'loading' ? '' : ' is-hidden'}`} src={reel.thumb} alt="" draggable="false" loading={mounted ? 'eager' : 'lazy'} />
      <div
        className="rf-tap"
        role="button"
        tabIndex={isActive ? 0 : -1}
        aria-label={`Play or pause ${titleOf(reel)}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
      />
      {isActive && userPaused && (
        <div className="rf-paused" aria-hidden="true">
          <PlayIcon />
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
      <div
        ref={trackRef}
        className="rf-progress"
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={isActive ? 0 : -1}
        onPointerDown={handleSeekDown}
        onPointerMove={handleSeekMove}
        onPointerUp={handleSeekUp}
        onPointerCancel={handleSeekUp}
      >
        <div className="rf-progress-track" />
        <div ref={fillRef} className="rf-progress-fill" />
      </div>
    </div>
  );
}

/* ---------- one full-screen slide ---------- */

const ReelSlide = React.memo(function ReelSlide({
  reel,
  index,
  isActive,
  mounted,
  muted,
  uiHidden,
  following,
  bookmarked,
  onLike,
  onDoubleLike,
  onOpenComments,
  onOpenDetails,
  onOpenChannel,
  onShare,
  onToggleFollow,
  onToggleBookmark,
  onForceMute,
  onHoldChange,
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <section className="rf-slide" data-index={index} aria-label={titleOf(reel)}>
      <div className="rf-stage">
        <div className="rf-stage-glow" style={{ backgroundImage: `url(${JSON.stringify(reel.thumb)})` }} aria-hidden="true" />
        <VideoLayer
          reel={reel}
          isActive={isActive}
          mounted={mounted}
          muted={muted}
          onDoubleLike={() => onDoubleLike(reel.id)}
          onForceMute={onForceMute}
          onPlayStateChange={setPlaying}
          onHoldChange={onHoldChange}
        />
        <div className="rf-scrim rf-scrim--top" />
        <div className="rf-scrim rf-scrim--bottom" />

        <div className={`rf-hideable${uiHidden ? ' is-hidden' : ''}`}>
          <div className="rf-rail" role="group" aria-label="Actions">
            <RailButton label={reel.liked ? 'Unlike' : 'Like'} caption={formatCount(reel.likes)} active={reel.liked} tone="like" onClick={() => onLike(reel.id)}>
              <HeartIcon filled={reel.liked} />
            </RailButton>
            <RailButton label="Open comments" caption={formatCount(reel.comments)} onClick={() => onOpenComments(reel.id)}>
              <CommentIcon />
            </RailButton>
            <RailButton label="Bookmark" caption="Save" active={bookmarked} tone="bookmark" onClick={() => onToggleBookmark(reel.id)}>
              <BookmarkIcon filled={bookmarked} />
            </RailButton>
            <RailButton label="Share" caption="Share" onClick={() => onShare(reel.id)}>
              <ShareIcon />
            </RailButton>
            <RailButton label="Show details" caption="More" onClick={() => onOpenDetails(reel.id)}>
              <InfoIcon />
            </RailButton>
            <button type="button" className="rf-disc-btn" onClick={() => onOpenDetails(reel.id)} aria-label="Sound details">
              <SoundDisc src={reel.channelLogo} name={nameOf(reel)} spinning={isActive && playing} />
            </button>
          </div>

          <div className="rf-meta">
            <button type="button" className="rf-creator-pill" onClick={() => onOpenChannel(reel)} aria-label={`View ${nameOf(reel)} profile`}>
              <Avatar name={nameOf(reel)} src={reel.channelLogo} />
              <span className="rf-creator-name">
                {nameOf(reel)}
                {reel.verified && <VerifiedBadge />}
              </span>
              <span
                role="button"
                tabIndex={0}
                className={`rf-follow rf-follow--sm${following ? ' is-on' : ''}`}
                aria-pressed={following}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFollow(reel.channelId || nameOf(reel));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    onToggleFollow(reel.channelId || nameOf(reel));
                  }
                }}
              >
                {following ? 'Following' : 'Follow'}
              </span>
            </button>

            <div className="rf-sound-line">
              <svg className="rf-sound-note" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                <path fill="currentColor" d="M9 18V5l12-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zm12-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3z" />
              </svg>
              <div className="rf-marquee">
                <span>{soundOf(reel)} &nbsp;&nbsp;•&nbsp;&nbsp; {soundOf(reel)}</span>
              </div>
            </div>

            <button type="button" className="rf-title" onClick={() => onOpenDetails(reel.id)}>
              <span>{titleOf(reel)}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
});

/* ---------------------------------------------------------------------------
 * The feed. Declared directly as the default export so the binding exists
 * from the first line of module evaluation.
 * ------------------------------------------------------------------------- */

export default function ReelsFeed() {
  const [reels, setReels] = useState([]);
  const [status, setStatus] = useState('loading');
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(shouldStartMuted);
  const [uiHidden, setUiHidden] = useState(false);
  const [follows, setFollows] = useState(() => readStore(SUBS_KEY));
  const [bookmarks, setBookmarks] = useState(() => readStore(BOOKMARKS_KEY));
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState('');

  const scrollerRef = useRef(null);
  const reelsRef = useRef(reels);
  const activeRef = useRef(activeIndex);
  const pendingLikes = useRef(new Set());
  const toastTimer = useRef(null);
  const lastSheet = useRef(null);

  reelsRef.current = reels;
  activeRef.current = activeIndex;

  useEffect(() => {
    document.documentElement.classList.add('rf-body');
    document.body.classList.add('rf-body');
    return () => {
      document.documentElement.classList.remove('rf-body');
      document.body.classList.remove('rf-body');
    };
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const loadReels = useCallback(async (signal) => {
    setStatus('loading');
    try {
      const payload = await api(API.list, { signal });
      setReels(unwrapList(payload).map(normalizeReel).filter(Boolean));
      setStatus('ready');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadReels(controller.signal);
    return () => controller.abort();
  }, [loadReels]);

  const patchReel = useCallback((id, patch) => {
    setReels((prev) => prev.map((r) => (r.id === id ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)));
  }, []);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || reels.length === 0 || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= ACTIVE_THRESHOLD) {
            setActiveIndex(Number(entry.target.dataset.index));
          }
        });
      },
      { root, threshold: ACTIVE_THRESHOLD }
    );
    root.querySelectorAll('[data-index]').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [reels.length]);

  const go = useCallback((delta) => {
    const root = scrollerRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll('[data-index]');
    const next = Math.min(Math.max(activeRef.current + delta, 0), nodes.length - 1);
    if (nodes[next]) nodes[next].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, go]);

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
        if (err && (err.status === 401 || err.status === 403)) {
          patchReel(id, (r) => ({ liked: !next, likes: Math.max(0, r.likes - delta) }));
          showToast('Log in to like Reels.');
        } else {
          console.warn(`[Reels] Like was not saved on the server (status ${err && err.status}); kept on this device.`, err);
        }
      } finally {
        pendingLikes.current.delete(id);
      }
    },
    [patchReel, showToast]
  );

  const onLike = useCallback((id) => toggleLike(id, false), [toggleLike]);
  const onDoubleLike = useCallback((id) => toggleLike(id, true), [toggleLike]);

  const onShare = useCallback((id) => {
    const r = reelsRef.current.find((x) => x.id === id);
    if (!r) return;
    const text = `${titleOf(r)}\nhttps://www.youtube.com/shorts/${r.videoId}`;
    if (navigator.share) {
      navigator.share({ title: titleOf(r), text, url: `https://www.youtube.com/shorts/${r.videoId}` }).catch(() => {});
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

  const onCountDelta = useCallback((id, delta) => patchReel(id, (r) => ({ comments: Math.max(0, r.comments + delta) })), [patchReel]);

  const openComments = useCallback((id) => setSheet({ type: 'comments', id }), []);
  const openDetails = useCallback((id) => setSheet({ type: 'details', id }), []);
  const openChannel = useCallback((reel) => {
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

  const selectReelById = useCallback((id) => {
    const idx = reelsRef.current.findIndex((r) => r.id === id);
    if (idx !== -1) {
      setActiveIndex(idx);
      const root = scrollerRef.current;
      if (root) {
        const nodes = root.querySelectorAll('[data-index]');
        if (nodes[idx]) nodes[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, []);

  if (sheet) lastSheet.current = sheet;
  const sheetData = sheet || lastSheet.current || {};
  const sheetReel = sheetData.id ? reels.find((r) => r.id === sheetData.id) || null : null;

  const ready = status === 'ready' && reels.length > 0;
  const activeReel = reels[activeIndex] || reels[0];
  const sheetOpen = Boolean(sheet);

  return (
    <main className="rf-root" aria-label="Reels">
      <div className={`rf-chrome${uiHidden ? ' is-hidden' : ''}`}>
        <div className="rf-chrome-left">
          <button type="button" className="rf-glass-btn" onClick={goBack} aria-label="Go back">
            <BackIcon />
          </button>
          <span className="rf-chrome-title">Reels</span>
        </div>
        {ready && (
          <button type="button" className="rf-glass-btn" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} aria-pressed={!muted}>
            <VolumeIcon muted={muted} />
          </button>
        )}
      </div>

      {status === 'loading' && <Skeleton />}
      {status === 'error' && <StateCard title="Couldn't load Reels" body="Check your connection and try again." actionLabel="Try again" onAction={() => loadReels()} />}
      {status === 'ready' && reels.length === 0 && <StateCard title="No Reels yet" body="New videos will show up here once they're published." />}

      {ready && (
        <>
          <div className="rf-ambient" aria-hidden="true" style={{ backgroundImage: `url(${JSON.stringify(activeReel.thumb)})` }} />
          <div className="rf-scroller" ref={scrollerRef}>
            {reels.map((r, i) => (
              <ReelSlide
                key={r.id}
                reel={r}
                index={i}
                isActive={i === activeIndex}
                mounted={i >= activeIndex - PRELOAD_BEHIND && i <= activeIndex + PRELOAD_AHEAD}
                muted={muted}
                uiHidden={uiHidden && i === activeIndex}
                following={Boolean(follows[r.channelId || r.channelName])}
                bookmarked={Boolean(bookmarks[r.id])}
                onLike={onLike}
                onDoubleLike={onDoubleLike}
                onOpenComments={openComments}
                onOpenDetails={openDetails}
                onOpenChannel={openChannel}
                onShare={onShare}
                onToggleFollow={onToggleFollow}
                onToggleBookmark={onToggleBookmark}
                onForceMute={onForceMute}
                onHoldChange={setUiHidden}
              />
            ))}
          </div>

          <div className="rf-nav">
            <button type="button" className="rf-glass-btn rf-glass-btn--lg" onClick={() => go(-1)} disabled={activeIndex === 0} aria-label="Previous reel">
              <ChevronIcon up />
            </button>
            <button type="button" className="rf-glass-btn rf-glass-btn--lg" onClick={() => go(1)} disabled={activeIndex >= reels.length - 1} aria-label="Next reel">
              <ChevronIcon />
            </button>
          </div>

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