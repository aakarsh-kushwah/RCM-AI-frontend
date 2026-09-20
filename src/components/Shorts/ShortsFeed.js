import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './ShortsFeed.css';

/* ---------------------------------------------------------------------------
 * ShortsFeed
 *
 * Self-contained on purpose: this file imports only React and its own
 * stylesheet. It never imports App.js, a barrel index.js or any shared module
 * that could import it back, so it cannot be part of an import cycle (the
 * cause of "Cannot access 'WEBPACK_DEFAULT_EXPORT' before initialization").
 * ------------------------------------------------------------------------- */

/* ---------- configuration (adjust here if your backend differs) ---------- */

const API_BASE = (process.env.REACT_APP_API_URL || '').replace(/\/+$/, '');
const API = {
  list: '/api/shorts',
  like: (id) => `/api/shorts/${encodeURIComponent(id)}/like`,
  comments: (id) => `/api/shorts/${encodeURIComponent(id)}/comments`,
};
const TOKEN_KEY = 'token';
const SUBS_KEY = 'rcm_shorts_subscriptions';
const ACTIVE_THRESHOLD = 0.65;

/* ---------- network ---------- */

async function api(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch (e) {
    /* storage unavailable, continue without auth header */
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
  if (res.status === 204) return null;
  const type = res.headers.get('content-type') || '';
  return type.includes('json') ? res.json() : null;
}

function unwrapList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const keys = ['shorts', 'comments', 'data', 'items', 'results'];
    for (let i = 0; i < keys.length; i += 1) {
      if (Array.isArray(payload[keys[i]])) return payload[keys[i]];
    }
  }
  return [];
}

/* ---------- data normalisation (real DB fields, no fake fallbacks) ---------- */

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function extractVideoId(short) {
  const direct =
    short.youtubeId ?? short.youtube_id ?? short.videoId ?? short.video_id ?? short.ytId;
  if (direct && YT_ID.test(String(direct))) return String(direct);
  const url =
    short.youtubeUrl ??
    short.youtube_url ??
    short.videoUrl ??
    short.video_url ??
    short.url ??
    short.link ??
    direct;
  if (typeof url === 'string') {
    const match = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
    if (match) return match[1];
  }
  return null;
}

function extractHashtags(short) {
  const found = new Map();
  const add = (tag) => {
    const clean = String(tag)
      .trim()
      .replace(/^#+/, '')
      .replace(/[.,;:!?)]+$/, '');
    if (clean) found.set(clean.toLowerCase(), clean);
  };
  const explicit = short.hashtags ?? short.tags ?? [];
  (Array.isArray(explicit) ? explicit : String(explicit).split(/[,\s]+/)).forEach(add);
  (String(short.description ?? '').match(/#[^\s#]+/g) || []).forEach(add);
  return Array.from(found.values());
}

function normalizeShort(short) {
  const videoId = extractVideoId(short);
  if (!videoId) return null;
  return {
    id: String(short._id ?? short.id ?? videoId),
    videoId,
    title: short.title || 'Untitled short',
    description: String(short.description ?? ''),
    thumb:
      short.thumbnail ??
      short.thumbnailUrl ??
      short.thumbnail_url ??
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    channelName:
      short.channelName ??
      short.channel_name ??
      short.channelTitle ??
      short.channel?.name ??
      'Channel',
    channelLogo:
      short.channelLogo ??
      short.channel_logo ??
      short.channelAvatar ??
      short.channel?.logo ??
      short.channel?.avatar ??
      '',
    likes: num(short.likesCount ?? short.likes_count ?? 0),
    comments: num(short.commentsCount ?? short.comments_count ?? 0),
    views: num(short.viewCount ?? short.view_count ?? short.views ?? 0),
    date: short.publishedAt ?? short.published_at ?? short.createdAt ?? short.created_at ?? null,
    hashtags: extractHashtags(short),
    liked: Boolean(short.isLiked ?? short.liked ?? short.likedByMe ?? false),
  };
}

function normalizeComment(c, i = 0) {
  const authorRaw =
    c.userName ??
    c.user_name ??
    c.username ??
    c.user?.name ??
    c.user?.username ??
    c.author?.name ??
    c.author;
  const author = typeof authorRaw === 'string' && authorRaw.trim() ? authorRaw.trim() : 'User';
  return {
    id: String(c._id ?? c.id ?? `c-${i}`),
    author,
    text: String(c.text ?? c.content ?? c.comment ?? c.body ?? ''),
    date: c.createdAt ?? c.created_at ?? c.date ?? null,
    pending: false,
  };
}

/* ---------- formatting helpers ---------- */

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
  return (Array.from(String(name || '?').trim())[0] || '?').toUpperCase();
}

/* ---------- misc helpers ---------- */

function shouldStartMuted() {
  // Sound autoplay is only allowed once the user has interacted with the page.
  try {
    return !(navigator.userActivation && navigator.userActivation.hasBeenActive);
  } catch (e) {
    return true;
  }
}

function loadSubs() {
  try {
    return JSON.parse(window.localStorage.getItem(SUBS_KEY) || '{}') || {};
  } catch (e) {
    return {};
  }
}

function goBack() {
  if (window.history.length > 1) window.history.back();
  else window.location.assign('/');
}

function buildEmbedSrc(videoId, muted) {
  const params = new URLSearchParams({
    autoplay: '1',
    enablejsapi: '1',
    mute: muted ? '1' : '0',
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

function Icon({ children, size = 24, fill = 'none', stroke = 'currentColor' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={fill}
      stroke={stroke}
      strokeWidth="2"
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

function WhatsAppIcon() {
  return (
    <Icon fill="currentColor" stroke="none">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
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
    <Icon size={34} fill="currentColor" stroke="none">
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

/* ---------- small building blocks ---------- */

function Avatar({ name, src, className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (src && !failed) {
    return (
      <img
        className={`sf-avatar ${className}`}
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className={`sf-avatar ${className}`}
      style={{ background: `hsl(${hueFor(name)}, 55%, 38%)` }}
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
      className={`sf-rail-btn${active ? ' is-active' : ''}${tone ? ` sf-rail-btn--${tone}` : ''}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={typeof active === 'boolean' ? active : undefined}
    >
      <span className="sf-rail-icon">{children}</span>
      <span className="sf-rail-caption">{caption}</span>
    </button>
  );
}

function StateCard({ title, body, actionLabel, onAction }) {
  return (
    <div className="sf-state" role="status">
      <h2>{title}</h2>
      <p>{body}</p>
      {actionLabel && (
        <button type="button" className="sf-pill-btn" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="sf-skeleton" role="status" aria-label="Loading Shorts">
      <div className="sf-skel-stage">
        <div className="sf-skel-rail">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="sf-skel-meta">
          <div className="sf-skel-row">
            <span className="sf-skel-dot" />
            <span className="sf-skel-bar sf-w40" />
          </div>
          <span className="sf-skel-bar sf-w90" />
          <span className="sf-skel-bar sf-w60" />
        </div>
      </div>
    </div>
  );
}

/* ---------- bottom sheet (65vh, slide-up, drag to dismiss) ---------- */

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
    const { dy } = drag.current;
    drag.current = null;
    if (sheetRef.current) {
      sheetRef.current.style.transition = '';
      sheetRef.current.style.transform = '';
    }
    if (dy > 90) onClose();
  };

  return (
    <div className={`sf-sheet-root${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <div className="sf-backdrop" onClick={onClose} />
      <div ref={sheetRef} className="sf-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div
          className="sf-sheet-top"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div className="sf-sheet-grab" aria-hidden="true" />
          <header className="sf-sheet-head">
            <h2>
              {title}
              {meta ? <span className="sf-sheet-meta">{meta}</span> : null}
            </h2>
            <button type="button" className="sf-icon-btn" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </header>
        </div>
        <div className="sf-sheet-body">{children}</div>
        {footer}
      </div>
    </div>
  );
}

function CommentsSheet({ short, open, onClose, onCountDelta }) {
  const shortId = short ? short.id : null;
  const [items, setItems] = useState([]);
  const [state, setState] = useState('idle'); // idle | loading | ready | error
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!open || !shortId) return undefined;
    const controller = new AbortController();
    setItems([]);
    setPostError('');
    setState('loading');
    api(API.comments(shortId), { signal: controller.signal })
      .then((payload) => {
        setItems(unwrapList(payload).map(normalizeComment));
        setState('ready');
      })
      .catch((err) => {
        if (err && err.name !== 'AbortError') setState('error');
      });
    return () => controller.abort();
  }, [open, shortId, reloadKey]);

  const submit = async () => {
    const value = text.trim();
    if (!value || posting || !shortId) return;
    const tempId = `tmp-${Date.now()}`;
    setPosting(true);
    setPostError('');
    setText('');
    setState('ready');
    setItems((prev) => [
      { id: tempId, author: 'You', text: value, date: new Date().toISOString(), pending: true },
      ...prev,
    ]);
    onCountDelta(shortId, 1); // counter moves immediately
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    try {
      const saved = await api(API.comments(shortId), {
        method: 'POST',
        body: JSON.stringify({ text: value, content: value }),
      });
      const payload = saved && typeof saved === 'object' ? saved.comment ?? saved.data ?? saved : null;
      const hasText =
        payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        (payload.text ?? payload.content ?? payload.comment ?? payload.body);
      setItems((prev) =>
        prev.map((c) => {
          if (c.id !== tempId) return c;
          if (!hasText) return { ...c, pending: false };
          const real = normalizeComment(payload);
          return { ...real, author: real.author === 'User' ? 'You' : real.author };
        })
      );
    } catch (err) {
      setItems((prev) => prev.filter((c) => c.id !== tempId));
      onCountDelta(shortId, -1);
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
    <div className="sf-compose-wrap">
      {postError ? (
        <p className="sf-inline-error" role="alert">
          {postError}
        </p>
      ) : null}
      <div className="sf-compose">
        <input
          type="text"
          className="sf-input"
          placeholder="Add a comment"
          value={text}
          maxLength={500}
          enterKeyHint="send"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Add a comment"
        />
        <button
          type="button"
          className="sf-send"
          onClick={submit}
          disabled={!text.trim() || posting}
          aria-label="Post comment"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );

  return (
    <Sheet
      open={open}
      title="Comments"
      meta={short ? formatCount(short.comments) : ''}
      onClose={onClose}
      footer={footer}
    >
      <div ref={bodyRef} className="sf-comments">
        {state === 'loading' && items.length === 0 && (
          <div className="sf-comment-skeletons" role="status" aria-label="Loading comments">
            <span />
            <span />
            <span />
          </div>
        )}
        {state === 'error' && (
          <div className="sf-sheet-empty">
            <p>Couldn&apos;t load comments.</p>
            <button type="button" className="sf-pill-btn" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </button>
          </div>
        )}
        {state === 'ready' && items.length === 0 && (
          <div className="sf-sheet-empty">
            <p>No comments yet.</p>
            <span>Be the first to say something.</span>
          </div>
        )}
        {items.length > 0 && (
          <ul className="sf-comment-list">
            {items.map((c) => (
              <li key={c.id} className={`sf-comment${c.pending ? ' is-pending' : ''}`}>
                <Avatar name={c.author} className="sf-avatar--sm" />
                <div className="sf-comment-main">
                  <div className="sf-comment-head">
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

function DetailsSheet({ short, open, onClose }) {
  return (
    <Sheet open={open} title="Details" onClose={onClose}>
      {short && (
        <div className="sf-details">
          <h3 className="sf-d-title">{short.title}</h3>
          <p className="sf-d-channel">{short.channelName}</p>
          <div className="sf-d-stats">
            <div>
              <strong title={short.views.toLocaleString('en-IN')}>{formatCount(short.views)}</strong>
              <span>Views</span>
            </div>
            <div>
              <strong>{formatCount(short.likes)}</strong>
              <span>Likes</span>
            </div>
            <div>
              <strong>{formatDate(short.date)}</strong>
              <span>Posted</span>
            </div>
          </div>
          <p className="sf-d-desc">{short.description || 'No description provided.'}</p>
          {short.hashtags.length > 0 && (
            <div className="sf-tags">
              {short.hashtags.map((tag) => (
                <span key={tag} className="sf-tag">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ---------- video layer: poster, iframe (active slide only), tap, progress ---------- */

function VideoLayer({ short, isActive, muted, onDoubleLike }) {
  const iframeRef = useRef(null);
  const fillRef = useRef(null);
  const statusRef = useRef('loading');
  const lastTap = useRef(0);
  const tapTimer = useRef(null);
  const burstTimer = useRef(null);
  const mutedRef = useRef(muted);
  const [status, setStatus] = useState('loading'); // loading | playing | paused
  const [burst, setBurst] = useState(null);

  mutedRef.current = muted;

  // Only the active slide owns an iframe. Leaving the slide unmounts it,
  // which silences the previous video immediately.
  const src = useMemo(
    () => (isActive ? buildEmbedSrc(short.videoId, mutedRef.current) : null),
    [isActive, short.videoId]
  );

  const post = useCallback((func, args = []) => {
    const frame = iframeRef.current;
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    }
  }, []);

  // Reset when the slide stops being active.
  useEffect(() => {
    if (isActive) return;
    statusRef.current = 'loading';
    setStatus('loading');
    if (fillRef.current) fillRef.current.style.transform = 'scaleX(0)';
  }, [isActive]);

  // Listen to the YouTube player (state + progress).
  useEffect(() => {
    if (!isActive) return undefined;
    let heard = false;

    const applyState = (s) => {
      const next = s === 1 ? 'playing' : s === 2 ? 'paused' : null;
      if (next && statusRef.current !== next) {
        statusRef.current = next;
        setStatus(next);
      }
    };

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
      const info = data.info;
      if (typeof info === 'number' && data.event === 'onStateChange') applyState(info);
      if (info && typeof info === 'object') {
        if (typeof info.playerState === 'number') applyState(info.playerState);
        if (fillRef.current && info.duration > 0 && typeof info.currentTime === 'number') {
          const ratio = Math.min(1, Math.max(0, info.currentTime / info.duration));
          fillRef.current.style.transform = `scaleX(${ratio})`;
        }
      }
    };

    window.addEventListener('message', onMessage);
    const handshake = () => {
      const frame = iframeRef.current;
      if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage(
          JSON.stringify({ event: 'listening', id: short.id, channel: 'widget' }),
          '*'
        );
      }
    };
    const timer = setInterval(() => {
      if (heard) clearInterval(timer);
      else handshake();
    }, 400);

    return () => {
      window.removeEventListener('message', onMessage);
      clearInterval(timer);
    };
  }, [isActive, short.id]);

  // Follow the global mute toggle without reloading the iframe.
  useEffect(() => {
    if (isActive) post(muted ? 'mute' : 'unMute');
  }, [muted, isActive, post]);

  // Pause when the tab is hidden, resume when it returns.
  useEffect(() => {
    if (!isActive) return undefined;
    let wasPlaying = false;
    const onVisibility = () => {
      if (document.hidden) {
        wasPlaying = statusRef.current === 'playing';
        if (wasPlaying) post('pauseVideo');
      } else if (wasPlaying) {
        post('playVideo');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isActive, post]);

  useEffect(
    () => () => {
      clearTimeout(tapTimer.current);
      clearTimeout(burstTimer.current);
    },
    []
  );

  const togglePlay = () => post(statusRef.current === 'playing' ? 'pauseVideo' : 'playVideo');

  const handleTap = (e) => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      clearTimeout(tapTimer.current);
      lastTap.current = 0;
      const rect = e.currentTarget.getBoundingClientRect();
      setBurst({ x: e.clientX - rect.left, y: e.clientY - rect.top, key: now });
      clearTimeout(burstTimer.current);
      burstTimer.current = setTimeout(() => setBurst(null), 800);
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

  return (
    <div className="sf-video">
      {src && (
        <iframe
          ref={iframeRef}
          className="sf-iframe"
          src={src}
          title={short.title}
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
      <img
        className={`sf-poster${status === 'loading' ? '' : ' is-hidden'}`}
        src={short.thumb}
        alt=""
        draggable="false"
        loading={isActive ? 'eager' : 'lazy'}
      />
      <div
        className="sf-tap"
        role="button"
        tabIndex={isActive ? 0 : -1}
        aria-label={`Play or pause ${short.title}`}
        onClick={handleTap}
        onKeyDown={handleKeyDown}
      />
      {status === 'paused' && (
        <div className="sf-paused" aria-hidden="true">
          <PlayIcon />
        </div>
      )}
      {burst && (
        <span key={burst.key} className="sf-burst" style={{ left: burst.x, top: burst.y }} aria-hidden="true">
          <HeartIcon filled />
        </span>
      )}
      <div className="sf-progress" aria-hidden="true">
        <div ref={fillRef} className="sf-progress-fill" />
      </div>
    </div>
  );
}

/* ---------- one full-screen slide ---------- */

const ShortSlide = React.memo(function ShortSlide({
  short,
  index,
  isActive,
  muted,
  subscribed,
  onLike,
  onDoubleLike,
  onOpenComments,
  onOpenDetails,
  onShare,
  onToggleSubscribe,
}) {
  return (
    <section className="sf-slide" data-index={index} aria-label={short.title}>
      <div className="sf-stage">
        <VideoLayer
          short={short}
          isActive={isActive}
          muted={muted}
          onDoubleLike={() => onDoubleLike(short.id)}
        />
        <div className="sf-scrim sf-scrim--top" />
        <div className="sf-scrim sf-scrim--bottom" />

        <div className="sf-rail" role="group" aria-label="Actions">
          <RailButton
            label={short.liked ? 'Unlike' : 'Like'}
            caption={formatCount(short.likes)}
            active={short.liked}
            tone="like"
            onClick={() => onLike(short.id)}
          >
            <HeartIcon filled={short.liked} />
          </RailButton>
          <RailButton
            label="Open comments"
            caption={formatCount(short.comments)}
            onClick={() => onOpenComments(short.id)}
          >
            <CommentIcon />
          </RailButton>
          <RailButton
            label="Share on WhatsApp"
            caption="Share"
            tone="whatsapp"
            onClick={() => onShare(short.id)}
          >
            <WhatsAppIcon />
          </RailButton>
          <RailButton label="Show details" caption="Details" onClick={() => onOpenDetails(short.id)}>
            <InfoIcon />
          </RailButton>
        </div>

        <div className="sf-meta">
          <div className="sf-channel">
            <Avatar name={short.channelName} src={short.channelLogo} />
            <span className="sf-channel-name">{short.channelName}</span>
            <button
              type="button"
              className={`sf-sub${subscribed ? ' is-on' : ''}`}
              aria-pressed={subscribed}
              onClick={() => onToggleSubscribe(short.channelName)}
            >
              {subscribed ? 'Subscribed' : 'Subscribe'}
            </button>
          </div>
          <button type="button" className="sf-title" onClick={() => onOpenDetails(short.id)}>
            <span>{short.title}</span>
          </button>
        </div>
      </div>
    </section>
  );
});

/* ---------------------------------------------------------------------------
 * The feed. Declared directly as the default export so the binding exists
 * from the first line of module evaluation.
 * ------------------------------------------------------------------------- */

export default function ShortsFeed() {
  const [shorts, setShorts] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(shouldStartMuted);
  const [subs, setSubs] = useState(loadSubs);
  const [sheet, setSheet] = useState(null); // { type: 'comments' | 'details', id }
  const [toast, setToast] = useState('');

  const scrollerRef = useRef(null);
  const shortsRef = useRef(shorts);
  const activeRef = useRef(activeIndex);
  const pendingLikes = useRef(new Set());
  const toastTimer = useRef(null);
  const lastSheet = useRef(null);

  shortsRef.current = shorts;
  activeRef.current = activeIndex;

  /* page chrome: black canvas, no page scroll behind the feed */
  useEffect(() => {
    document.documentElement.classList.add('sf-body');
    document.body.classList.add('sf-body');
    return () => {
      document.documentElement.classList.remove('sf-body');
      document.body.classList.remove('sf-body');
    };
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  /* data */
  const loadShorts = useCallback(async (signal) => {
    setStatus('loading');
    try {
      const payload = await api(API.list, { signal });
      setShorts(unwrapList(payload).map(normalizeShort).filter(Boolean));
      setStatus('ready');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadShorts(controller.signal);
    return () => controller.abort();
  }, [loadShorts]);

  const patchShort = useCallback((id, patch) => {
    setShorts((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...(typeof patch === 'function' ? patch(s) : patch) } : s))
    );
  }, []);

  /* active slide detection: only the slide that is >= 65% visible plays */
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || shorts.length === 0 || typeof IntersectionObserver === 'undefined') return undefined;
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
  }, [shorts.length]);

  /* navigation */
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

  /* actions */
  const toggleLike = useCallback(
    async (id, forceOn = false) => {
      const current = shortsRef.current.find((s) => s.id === id);
      if (!current || pendingLikes.current.has(id)) return;
      const next = forceOn ? true : !current.liked;
      if (next === current.liked) return;
      const delta = next ? 1 : -1;
      pendingLikes.current.add(id);
      patchShort(id, (s) => ({ liked: next, likes: Math.max(0, s.likes + delta) }));
      try {
        await api(API.like(id), { method: 'POST', body: JSON.stringify({ liked: next }) });
      } catch (err) {
        patchShort(id, (s) => ({ liked: !next, likes: Math.max(0, s.likes - delta) }));
        showToast("Couldn't update your like. Try again.");
      } finally {
        pendingLikes.current.delete(id);
      }
    },
    [patchShort, showToast]
  );

  const onLike = useCallback((id) => toggleLike(id, false), [toggleLike]);
  const onDoubleLike = useCallback((id) => toggleLike(id, true), [toggleLike]);

  const onShare = useCallback((id) => {
    const s = shortsRef.current.find((x) => x.id === id);
    if (!s) return;
    const text = `${s.title}\nhttps://www.youtube.com/shorts/${s.videoId}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }, []);

  const onToggleSubscribe = useCallback((channelName) => {
    setSubs((prev) => {
      const next = { ...prev };
      if (next[channelName]) delete next[channelName];
      else next[channelName] = true;
      try {
        window.localStorage.setItem(SUBS_KEY, JSON.stringify(next));
      } catch (e) {
        /* ignore storage errors */
      }
      return next;
    });
  }, []);

  const onCountDelta = useCallback(
    (id, delta) => patchShort(id, (s) => ({ comments: Math.max(0, s.comments + delta) })),
    [patchShort]
  );

  const openComments = useCallback((id) => setSheet({ type: 'comments', id }), []);
  const openDetails = useCallback((id) => setSheet({ type: 'details', id }), []);
  const closeSheet = useCallback(() => setSheet(null), []);

  /* keep the last sheet target around so content doesn't vanish mid slide-out */
  if (sheet) lastSheet.current = sheet;
  const shownId = (sheet || lastSheet.current || {}).id;
  const sheetShort = shownId ? shorts.find((s) => s.id === shownId) || null : null;

  const ready = status === 'ready' && shorts.length > 0;
  const activeShort = shorts[activeIndex] || shorts[0];

  return (
    <main className="sf-root" aria-label="Shorts">
      <div className="sf-chrome">
        <div className="sf-chrome-left">
          <button type="button" className="sf-glass-btn" onClick={goBack} aria-label="Go back">
            <BackIcon />
          </button>
          <span className="sf-chrome-title">Shorts</span>
        </div>
        {ready && (
          <button
            type="button"
            className="sf-glass-btn"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
            aria-pressed={!muted}
          >
            <VolumeIcon muted={muted} />
          </button>
        )}
      </div>

      {status === 'loading' && <Skeleton />}
      {status === 'error' && (
        <StateCard
          title="Couldn't load Shorts"
          body="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => loadShorts()}
        />
      )}
      {status === 'ready' && shorts.length === 0 && (
        <StateCard title="No Shorts yet" body="New videos will show up here once they're published." />
      )}

      {ready && (
        <>
          <div
            className="sf-ambient"
            aria-hidden="true"
            style={{ backgroundImage: `url(${JSON.stringify(activeShort.thumb)})` }}
          />
          <div className="sf-scroller" ref={scrollerRef}>
            {shorts.map((s, i) => (
              <ShortSlide
                key={s.id}
                short={s}
                index={i}
                isActive={i === activeIndex}
                muted={muted}
                subscribed={Boolean(subs[s.channelName])}
                onLike={onLike}
                onDoubleLike={onDoubleLike}
                onOpenComments={openComments}
                onOpenDetails={openDetails}
                onShare={onShare}
                onToggleSubscribe={onToggleSubscribe}
              />
            ))}
          </div>

          <div className="sf-nav">
            <button
              type="button"
              className="sf-glass-btn sf-glass-btn--lg"
              onClick={() => go(-1)}
              disabled={activeIndex === 0}
              aria-label="Previous short"
            >
              <ChevronIcon up />
            </button>
            <button
              type="button"
              className="sf-glass-btn sf-glass-btn--lg"
              onClick={() => go(1)}
              disabled={activeIndex >= shorts.length - 1}
              aria-label="Next short"
            >
              <ChevronIcon />
            </button>
          </div>

          <CommentsSheet
            short={sheetShort}
            open={Boolean(sheet && sheet.type === 'comments')}
            onClose={closeSheet}
            onCountDelta={onCountDelta}
          />
          <DetailsSheet
            short={sheetShort}
            open={Boolean(sheet && sheet.type === 'details')}
            onClose={closeSheet}
          />
        </>
      )}

      <div className={`sf-toast${toast ? ' is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </main>
  );
}