import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    Search, Play, ArrowLeft, X, BadgeCheck, Share2, Check, Film, RotateCcw
} from 'lucide-react';
import { extractYouTubeId } from '../../utils/textUtils';
import './LeadersVideo.css';

const SKELETON_COUNT = 8;
const SKELETONS = Array.from({ length: SKELETON_COUNT }, (_, i) => i);
const MORE_SKELETONS = SKELETONS.slice(0, 4);
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

/* ------------------------------ player modal ------------------------------ */

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const CLOSE_MS = 200;

const LeaderVideoModal = ({ video, onClose }) => {
    const [closing, setClosing] = useState(false);
    const [copied, setCopied] = useState(false);
    const dialogRef = useRef(null);
    const closeRef = useRef(null);
    const closeTimer = useRef(0);
    const copyTimer = useRef(0);

    const requestClose = useCallback(() => {
        if (closing) return;
        setClosing(true);
        closeTimer.current = setTimeout(() => {
            setClosing(false);
            onClose();
        }, CLOSE_MS);
    }, [closing, onClose]);

    // Scroll lock + focus handling (runs only when a video opens / closes)
    useEffect(() => {
        if (!video) return undefined;
        const previouslyFocused = document.activeElement;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        setCopied(false);
        if (closeRef.current) closeRef.current.focus();

        return () => {
            document.body.style.overflow = prevOverflow;
            clearTimeout(closeTimer.current);
            clearTimeout(copyTimer.current);
            if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
        };
    }, [video]);

    // Escape closes, Tab stays inside the dialog
    useEffect(() => {
        if (!video) return undefined;
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
    }, [video, requestClose]);

    if (!video) return null;

    const ytId = extractYouTubeId(video.videoUrl);
    const embedUrl = ytId
        ? `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`
        : null;
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
            className={`lv-modal ${closing ? 'is-closing' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={video.title}
            onClick={requestClose}
        >
            <div className="lv-sheet" ref={dialogRef} onClick={(e) => e.stopPropagation()}>
                <div className="lv-player">
                    {embedUrl ? (
                        <iframe
                            className="lv-iframe"
                            src={embedUrl}
                            title={video.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            referrerPolicy="strict-origin-when-cross-origin"
                        />
                    ) : video.videoUrl ? (
                        <video
                            className="lv-iframe"
                            src={video.videoUrl}
                            poster={video.thumbnailUrl}
                            controls
                            autoPlay
                            playsInline
                        />
                    ) : (
                        <div className="lv-player-empty">This video is unavailable right now.</div>
                    )}
                    {embedUrl && <span className="lv-player-blocker" aria-hidden="true" />}
                    <button type="button" className="lv-close" ref={closeRef} onClick={requestClose} aria-label="Close video">
                        <X size={20} />
                    </button>
                </div>

                <div className="lv-info">
                    <h2 className="lv-info-title">{video.title}</h2>

                    <div className="lv-meta">
                        <LeaderTag name={video.leaderName || DEFAULT_LEADER} />
                    </div>

                    <div className="lv-actions">
                        <button type="button" className="lv-btn is-ghost" onClick={handleShare}>
                            {copied ? <Check size={16} /> : <Share2 size={16} />}
                            {copied ? 'Link copied' : canNativeShare ? 'Share' : 'Copy link'}
                        </button>
                    </div>

                    {video.description && <p className="lv-desc">{video.description}</p>}
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

    useEffect(() => {
        if (accessToken && API_URL) {
            setPage(1);
            setAllVideos([]);
            setHasMore(true);

            if (location.state && location.state.selectedVideo) {
                setActiveVideo(location.state.selectedVideo);
                navigate(location.pathname, { replace: true, state: {} });
            }

            fetchVideos(1, true);
        }
    }, [accessToken, API_URL, location.state, navigate, fetchVideos]);

    const filteredVideos = useMemo(() => {
        if (!debouncedSearchTerm) return allVideos;
        return allVideos.filter(video =>
            video.title.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
            (video.leaderName && video.leaderName.toLowerCase().includes(debouncedSearchTerm.toLowerCase()))
        );
    }, [allVideos, debouncedSearchTerm]);

    const handleSearchChange = useCallback((e) => {
        setSearchTerm(e.target.value);
    }, []);

    const handleClearSearch = useCallback(() => setSearchTerm(''), []);

    const handleVideoSelect = useCallback((video) => {
        setActiveVideo(video);
    }, []);

    const handleCloseModal = useCallback(() => {
        setActiveVideo(null);
    }, []);

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
        if (!el || !hasMore || debouncedSearchTerm || loading || loadingMore || error) return undefined;
        if (typeof IntersectionObserver === 'undefined') return undefined;

        const io = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) loadMoreRef.current();
        }, { rootMargin: '0px 0px 600px 0px' });

        io.observe(el);
        return () => io.disconnect();
    }, [hasMore, debouncedSearchTerm, loading, loadingMore, error, allVideos.length]);

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
                                key={video.id || video.publicId}
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

            <LeaderVideoModal video={activeVideo} onClose={handleCloseModal} />
        </div>
    );
}

export default LeadersVideo;