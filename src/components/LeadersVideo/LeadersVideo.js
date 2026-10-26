import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    Search, Play, ArrowLeft, X, BadgeCheck, Share2, Check, Film, RotateCcw, ChevronDown
} from 'lucide-react';
import { extractYouTubeId } from '../../utils/textUtils';
import './LeadersVideo.css';

const SKELETON_COUNT = 8;
const SKELETONS = Array.from({ length: SKELETON_COUNT }, (_, i) => i);
const MORE_SKELETONS = SKELETONS.slice(0, 4);
const NEXT_SKELETONS = SKELETONS.slice(0, 5);
const DEFAULT_LEADER = "Leader's Video";

function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
        return () => { clearTimeout(handler); };
    }, [value, delay]);
    return debouncedValue;
}

/* ------------------------------- helpers ------------------------------- */

const hueOf = (text = '') => {
    let h = 0;
    for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) % 360;
    return h;
};

const formatDuration = (d) => {
    if (d === null || d === undefined || d === '') return '';
    if (typeof d === 'string' && d.includes(':')) return d;
    const s = Number(d);
    if (!Number.isFinite(s) || s <= 0) return '';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const pad = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

const videoKey = (v) => v.id || v.publicId;

// Thumbnail fallback order: sharpest YouTube image -> always-available YouTube image
// -> thumbnail saved in the database -> styled placeholder (never a grey broken box)
const buildThumbChain = (video) => {
    const id = extractYouTubeId(video.videoUrl);
    const chain = [];
    if (id) {
        chain.push(`https://img.youtube.com/vi/${id}/maxresdefault.jpg`);
        chain.push(`https://img.youtube.com/vi/${id}/hqdefault.jpg`);
    }
    if (video.thumbnailUrl) chain.push(video.thumbnailUrl);
    return { id, chain };
};

/* ---------------------------- small components ---------------------------- */

const Thumb = memo(({ chain, title, eager }) => {
    const [idx, setIdx] = useState(0);
    const src = chain[idx];

    const advance = useCallback(() => setIdx((i) => i + 1), []);

    // YouTube answers a missing "maxres" with a tiny 120px grey image (or a 404): skip both
    const onLoad = useCallback((e) => {
        if (e.currentTarget.src.includes('img.youtube.com') && e.currentTarget.naturalWidth <= 120) {
            advance();
        }
    }, [advance]);

    if (!src) {
        return (
            <div className="lv-thumb-fallback" style={{ '--h': hueOf(title) }}>
                <Film size={30} strokeWidth={1.6} />
            </div>
        );
    }

    return (
        <img
            className="lv-thumb-img"
            src={src}
            alt={title}
            width="320"
            height="180"
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            onError={advance}
            onLoad={onLoad}
        />
    );
});

const LeaderTag = ({ name }) => (
    <span className="lv-leader">
        <span className="lv-avatar" style={{ '--h': hueOf(name) }}>{name.charAt(0).toUpperCase()}</span>
        <span className="lv-leader-name">{name}</span>
        <BadgeCheck size={14} className="lv-verified" aria-label="Verified" />
    </span>
);

const VideoCard = memo(({ video, index, onSelect }) => {
    const { id, chain } = useMemo(() => buildThumbChain(video), [video]);
    const duration = formatDuration(video.duration);

    return (
        <article className="lv-card" style={{ '--i': index % 8 }}>
            <button
                type="button"
                className="lv-card-btn"
                onClick={() => onSelect(video)}
                aria-label={`Play ${video.title}`}
            >
                <span className="lv-thumb">
                    <Thumb chain={chain} title={video.title} eager={index < 4} />
                    <span className="lv-thumb-shade" />
                    <span className="lv-play"><Play size={22} fill="currentColor" strokeWidth={0} /></span>
                    {id && <span className="lv-badge lv-badge-hd">HD</span>}
                    {duration && <span className="lv-badge lv-badge-time">{duration}</span>}
                </span>
                <span className="lv-card-info">
                    <span className="lv-card-title">{video.title}</span>
                    <LeaderTag name={video.leaderName || DEFAULT_LEADER} />
                </span>
            </button>
        </article>
    );
});

const SkeletonCard = memo(() => (
    <div className="lv-card lv-skel" aria-hidden="true">
        <div className="lv-thumb lv-shimmer" />
        <div className="lv-skel-lines">
            <i className="lv-shimmer" />
            <i className="lv-shimmer is-short" />
        </div>
    </div>
));

const StateBlock = memo(({ kind, message, onPrimary, primaryLabel }) => (
    <div className="lv-state" role={kind === 'error' ? 'alert' : undefined}>
        <svg className="lv-state-art" viewBox="0 0 160 120" fill="none" aria-hidden="true">
            <rect x="14" y="22" width="108" height="72" rx="14" stroke="currentColor" strokeWidth="2" opacity="0.35" />
            <path d="M58 44l28 14-28 14V44z" fill="currentColor" opacity="0.5" />
            <circle cx="118" cy="82" r="20" fill="#07080c" stroke="#9b6dff" strokeWidth="3" />
            <path d="M133 97l14 14" stroke="#9b6dff" strokeWidth="3.5" strokeLinecap="round" />
            {kind === 'error' && <path d="M111 75l14 14M125 75l-14 14" stroke="#fb7185" strokeWidth="2.5" strokeLinecap="round" />}
        </svg>
        <h3>{kind === 'error' ? 'Something went wrong' : 'No leader videos found'}</h3>
        <p>{message}</p>
        {onPrimary && (
            <button type="button" className="lv-btn" onClick={onPrimary}>
                <RotateCcw size={16} /> {primaryLabel}
            </button>
        )}
    </div>
));

/* ------------------------------ watch screen ------------------------------ */
/*
  YouTube-style watch screen:
  - phone: the player is pinned at the top, details and "Up next" scroll underneath
  - laptop / landscape: player + details on the left, suggestions list on the right
  Tapping a suggestion swaps the video instantly. Browser/phone Back returns to the list.
*/

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const CLOSE_MS = 200;

// The poster (thumbnail from the list, already cached) shows immediately on tap,
// then fades out as soon as the YouTube player has loaded.
const Player = memo(({ video }) => {
    const [ready, setReady] = useState(false);
    const { id, chain } = useMemo(() => buildThumbChain(video), [video]);
    const embedUrl = id
        ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1&fs=1`
        : null;
    const isFile = !id && Boolean(video.videoUrl);
    const unavailable = !embedUrl && !isFile;

    return (
        <div className="lv-player">
            {embedUrl && (
                <iframe
                    className="lv-iframe"
                    src={embedUrl}
                    title={video.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    onLoad={() => setReady(true)}
                />
            )}
            {isFile && (
                <video
                    className="lv-iframe"
                    src={video.videoUrl}
                    poster={video.thumbnailUrl}
                    controls
                    autoPlay
                    playsInline
                    onLoadedData={() => setReady(true)}
                />
            )}
            {unavailable && <div className="lv-player-empty">This video is unavailable right now.</div>}

            <div className={`lv-poster ${ready || unavailable ? 'is-hidden' : ''}`} aria-hidden="true">
                <Thumb chain={chain} title={video.title} eager />
                <span className="lv-poster-spin" />
            </div>

            {embedUrl && <span className="lv-player-blocker" aria-hidden="true" />}
        </div>
    );
});

const Description = ({ text }) => {
    const [open, setOpen] = useState(false);
    const long = text.length > 140 || text.includes('\n');

    return (
        <div className="lv-desc-box">
            <p className={`lv-desc ${open ? 'is-open' : ''}`}>{text}</p>
            {long && (
                <button type="button" className="lv-desc-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                    {open ? 'Show less' : '...more'}
                </button>
            )}
        </div>
    );
};

const WatchView = ({
    video, suggestions, loadingList, hasMore, loadingMore, canAutoLoad,
    onSelect, onClose, onLoadMore
}) => {
    const [closing, setClosing] = useState(false);
    const [copied, setCopied] = useState(false);
    const dialogRef = useRef(null);
    const scrollRef = useRef(null);
    const backRef = useRef(null);
    const sentinelRef = useRef(null);
    const closeTimer = useRef(0);
    const copyTimer = useRef(0);
    const currentKey = videoKey(video);

    const requestClose = useCallback(() => {
        if (closing) return;
        setClosing(true);
        closeTimer.current = setTimeout(onClose, CLOSE_MS);
    }, [closing, onClose]);

    // Page scroll lock + focus handling (runs once, while the watch screen is open)
    useEffect(() => {
        const previouslyFocused = document.activeElement;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        if (backRef.current) backRef.current.focus({ preventScroll: true });

        return () => {
            document.body.style.overflow = prevOverflow;
            clearTimeout(closeTimer.current);
            clearTimeout(copyTimer.current);
            if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus({ preventScroll: true });
        };
    }, []);

    // Escape closes, Tab stays inside the screen
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') {
                requestClose();
                return;
            }
            if (e.key !== 'Tab' || !dialogRef.current) return;
            const items = dialogRef.current.querySelectorAll(FOCUSABLE);
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [requestClose]);

    // New video picked from "Up next": jump back to the top so the player is in view
    useEffect(() => {
        setCopied(false);
        if (scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }, [currentKey]);

    // Auto-load more suggestions before the user reaches the end of the list
    const loadMoreRef = useRef(onLoadMore);
    useEffect(() => { loadMoreRef.current = onLoadMore; });

    useEffect(() => {
        const el = sentinelRef.current;
        const root = scrollRef.current;
        if (!el || !root || !hasMore || !canAutoLoad || loadingMore) return undefined;
        if (typeof IntersectionObserver === 'undefined') return undefined;

        const io = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) loadMoreRef.current();
        }, { root, rootMargin: '0px 0px 700px 0px' });

        io.observe(el);
        return () => io.disconnect();
    }, [hasMore, canAutoLoad, loadingMore, suggestions.length]);

    const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

    const handleShare = async () => {
        const url = video.videoUrl || window.location.href;
        if (canNativeShare) {
            try {
                await navigator.share({ title: video.title, url });
                return;
            } catch (err) {
                if (err && err.name === 'AbortError') return;
            }
        }
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            clearTimeout(copyTimer.current);
            copyTimer.current = setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            // clipboard blocked: nothing else to do
        }
    };

    return createPortal(
        <div
            className={`lv-watch ${closing ? 'is-closing' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={video.title}
            ref={dialogRef}
        >
            <div className="lv-watch-scroll" ref={scrollRef}>
                <div className="lv-watch-grid">
                    <div className="lv-watch-primary">
                        <div className="lv-player-wrap">
                            <Player key={currentKey} video={video} />
                            <button type="button" className="lv-watch-back" ref={backRef} onClick={requestClose} aria-label="Back to videos">
                                <ChevronDown size={24} />
                            </button>
                        </div>

                        <div className="lv-watch-info">
                            <h2 className="lv-info-title">{video.title}</h2>

                            <div className="lv-meta">
                                <LeaderTag name={video.leaderName || DEFAULT_LEADER} />
                                <button type="button" className="lv-btn is-ghost is-small" onClick={handleShare}>
                                    {copied ? <Check size={16} /> : <Share2 size={16} />}
                                    {copied ? 'Link copied' : canNativeShare ? 'Share' : 'Copy link'}
                                </button>
                            </div>

                            {video.description && <Description key={currentKey} text={video.description} />}
                        </div>
                    </div>

                    <aside className="lv-watch-next" aria-label="Up next">
                        <h3 className="lv-next-title">Up next</h3>

                        <div className="lv-next-list">
                            {loadingList && NEXT_SKELETONS.map((n) => <SkeletonCard key={`ns-${n}`} />)}

                            {suggestions.map((v, i) => (
                                <VideoCard key={videoKey(v)} video={v} index={i} onSelect={onSelect} />
                            ))}

                            {loadingMore && MORE_SKELETONS.map((n) => <SkeletonCard key={`nm-${n}`} />)}
                        </div>

                        {!loadingList && suggestions.length === 0 && !hasMore && (
                            <p className="lv-next-empty">No more videos right now.</p>
                        )}

                        {hasMore && (
                            <div className="lv-more-wrap">
                                <div ref={sentinelRef} className="lv-sentinel" aria-hidden="true" />
                                <button type="button" className="lv-more" onClick={onLoadMore} disabled={loadingMore}>
                                    {loadingMore ? <><span className="lv-spinner" /> Loading</> : 'Load more videos'}
                                </button>
                            </div>
                        )}
                    </aside>
                </div>
            </div>
        </div>,
        document.body
    );
};

/* ---------------------------------- page ---------------------------------- */

function LeadersVideo({ pageTitle }) {
    const [allVideos, setAllVideos] = useState([]);
    const [activeVideo, setActiveVideo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const { accessToken, API_URL } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    const reqId = useRef(0); // ignores late responses from an older request
    const sentinelRef = useRef(null);
    const watchPushed = useRef(false); // true when opening a video added a history entry

    // Full-screen chrome: removes the white browser margin around the page
    useEffect(() => {
        const root = document.documentElement;
        root.classList.add('lv-lock');
        return () => root.classList.remove('lv-lock');
    }, []);

    // Connect to YouTube early, so the first tap on a video starts faster
    useEffect(() => {
        const hosts = ['https://www.youtube-nocookie.com', 'https://i.ytimg.com', 'https://img.youtube.com'];
        const links = hosts.map((href) => {
            const link = document.createElement('link');
            link.rel = 'preconnect';
            link.href = href;
            document.head.appendChild(link);
            return link;
        });
        return () => links.forEach((l) => l.remove());
    }, []);

    const fetchVideos = useCallback(async (pageNum, isInitialLoad = false) => {
        const authToken = accessToken || localStorage.getItem('accessToken');
        if (!authToken || !API_URL) {
            setError("Authentication error. Please log in again.");
            setLoading(false);
            return;
        }

        const myReq = ++reqId.current;
        if (isInitialLoad) {
            setLoading(true);
            setLoadingMore(false);
        } else {
            setLoadingMore(true);
        }
        setError('');

        const limit = 20;
        const url = `${API_URL}/api/videos/leaders?page=${pageNum}&limit=${limit}`;

        try {
            const response = await axios.get(url, { headers: { Authorization: `Bearer ${authToken}` } });
            if (myReq !== reqId.current) return;

            if (response.data.success && Array.isArray(response.data.data)) {
                const newData = response.data.data;
                setAllVideos(prev => isInitialLoad ? newData : [...prev, ...newData]);
                setPage(pageNum); // saved only after success, so "retry" never skips a page
                setHasMore(response.data.pagination.currentPage < response.data.pagination.totalPages);
            } else {
                if (isInitialLoad) setAllVideos([]);
                setHasMore(false);
            }
        } catch (err) {
            if (myReq !== reqId.current) return;
            setError(err.response?.data?.message || 'Failed to load videos.');
        } finally {
            if (myReq === reqId.current) {
                if (isInitialLoad) setLoading(false); else setLoadingMore(false);
            }
        }
    }, [accessToken, API_URL]);

    // First page of videos
    useEffect(() => {
        if (accessToken && API_URL) {
            setPage(1);
            setAllVideos([]);
            setHasMore(true);
            fetchVideos(1, true);
        }
    }, [accessToken, API_URL, fetchVideos]);

    // Opened from another page with a chosen video: play it straight away
    const incomingVideo = location.state && location.state.selectedVideo;
    useEffect(() => {
        if (incomingVideo) {
            setActiveVideo(incomingVideo);
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [incomingVideo, navigate, location.pathname]);

    // Phone / browser Back button closes the watch screen instead of leaving the page
    useEffect(() => {
        if (watchPushed.current && !(location.state && location.state.lvWatch)) {
            watchPushed.current = false;
            setActiveVideo(null);
        }
    }, [location.state]);

    const filteredVideos = useMemo(() => {
        if (!debouncedSearchTerm) return allVideos;
        return allVideos.filter(video =>
            video.title.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
            (video.leaderName && video.leaderName.toLowerCase().includes(debouncedSearchTerm.toLowerCase()))
        );
    }, [allVideos, debouncedSearchTerm]);

    // "Up next": every other loaded video, videos of the same leader first
    const suggestions = useMemo(() => {
        if (!activeVideo) return [];
        const current = videoKey(activeVideo);
        const others = allVideos.filter((v) => videoKey(v) !== current);
        const leader = activeVideo.leaderName;
        if (!leader) return others;
        const same = [];
        const rest = [];
        others.forEach((v) => (v.leaderName === leader ? same : rest).push(v));
        return [...same, ...rest];
    }, [activeVideo, allVideos]);

    const handleSearchChange = useCallback((e) => {
        setSearchTerm(e.target.value);
    }, []);

    const handleClearSearch = useCallback(() => setSearchTerm(''), []);

    const handleVideoSelect = useCallback((video) => {
        if (!watchPushed.current) {
            navigate(location.pathname + location.search, { state: { lvWatch: true } });
            watchPushed.current = true;
        }
        setActiveVideo(video);
    }, [navigate, location.pathname, location.search]);

    const handleCloseWatch = useCallback(() => {
        if (watchPushed.current) navigate(-1);
        else setActiveVideo(null);
    }, [navigate]);

    const handleLoadMore = useCallback(() => {
        if (!loadingMore && hasMore) {
            fetchVideos(page + 1, false);
        }
    }, [page, loadingMore, hasMore, fetchVideos]);

    const handleRetry = useCallback(() => {
        if (allVideos.length === 0) fetchVideos(1, true);
        else fetchVideos(page + 1, false);
    }, [allVideos.length, page, fetchVideos]);

    // Auto "load more" when the end of the list comes near the screen.
    // Safety: never while loading, never while searching, never after an error.
    const loadMoreRef = useRef(handleLoadMore);
    useEffect(() => { loadMoreRef.current = handleLoadMore; });

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || activeVideo || !hasMore || debouncedSearchTerm || loading || loadingMore || error) return undefined;
        if (typeof IntersectionObserver === 'undefined') return undefined;

        const io = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) loadMoreRef.current();
        }, { rootMargin: '0px 0px 600px 0px' });

        io.observe(el);
        return () => io.disconnect();
    }, [activeVideo, hasMore, debouncedSearchTerm, loading, loadingMore, error, allVideos.length]);

    const showSkeleton = loading && allVideos.length === 0;
    const showFullError = !loading && !!error && allVideos.length === 0;
    const showEmpty = !loading && !error && filteredVideos.length === 0;

    return (
        <div className="lv-page">
            <div className="lv-wrap lv-head">
                <div className="lv-title-row">
                    <button type="button" onClick={() => navigate('/dashboard')} className="lv-back" aria-label="Back to dashboard">
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="lv-title">{pageTitle || "Leaders' Videos"}</h1>
                </div>

                <div className="lv-search">
                    <Search size={19} className="lv-search-icon" />
                    <input
                        type="text"
                        inputMode="search"
                        enterKeyHint="search"
                        value={searchTerm}
                        onChange={handleSearchChange}
                        placeholder="Search leader videos"
                        className="lv-search-input"
                        aria-label="Search leader videos"
                    />
                    {searchTerm && (
                        <button type="button" className="lv-search-clear" onClick={handleClearSearch} aria-label="Clear search">
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            <main className="lv-wrap lv-main" aria-busy={loading || loadingMore}>
                {showFullError && (
                    <StateBlock kind="error" message={error} onPrimary={handleRetry} primaryLabel="Try again" />
                )}

                {!showFullError && (
                    <div className="lv-grid">
                        {showSkeleton && SKELETONS.map((n) => <SkeletonCard key={`s-${n}`} />)}

                        {filteredVideos.map((video, index) => (
                            <VideoCard
                                key={videoKey(video)}
                                video={video}
                                index={index}
                                onSelect={handleVideoSelect}
                            />
                        ))}

                        {loadingMore && MORE_SKELETONS.map((n) => <SkeletonCard key={`m-${n}`} />)}
                    </div>
                )}

                {showEmpty && (
                    <StateBlock
                        kind="empty"
                        message={debouncedSearchTerm ? 'Try a different name or word.' : 'New videos will show up here soon.'}
                        onPrimary={debouncedSearchTerm ? handleClearSearch : undefined}
                        primaryLabel="Clear search"
                    />
                )}

                {!showFullError && !!error && allVideos.length > 0 && (
                    <div className="lv-inline-error" role="alert">
                        <span>{error}</span>
                        <button type="button" className="lv-btn is-ghost" onClick={handleRetry}>Retry</button>
                    </div>
                )}

                {hasMore && !debouncedSearchTerm && allVideos.length > 0 && (
                    <div className="lv-more-wrap">
                        <div ref={sentinelRef} className="lv-sentinel" aria-hidden="true" />
                        <button type="button" className="lv-more" onClick={handleLoadMore} disabled={loadingMore}>
                            {loadingMore ? <><span className="lv-spinner" /> Loading</> : 'Load more videos'}
                        </button>
                    </div>
                )}
            </main>

            {activeVideo && (
                <WatchView
                    video={activeVideo}
                    suggestions={suggestions}
                    loadingList={showSkeleton}
                    hasMore={hasMore}
                    loadingMore={loadingMore}
                    canAutoLoad={!loading && !error}
                    onSelect={handleVideoSelect}
                    onClose={handleCloseWatch}
                    onLoadMore={handleLoadMore}
                />
            )}
        </div>
    );
}

export default LeadersVideo;