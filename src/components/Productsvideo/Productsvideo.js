import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    Search, Play, ArrowLeft, X, BadgeCheck, Share2, Check, Film, RotateCcw
} from 'lucide-react';
import { extractYouTubeId } from '../../utils/textUtils';
import './Productsvideo.css';

const productCategories = [
    "All",
    "Health Care", "Men's Fashion", "Women's Fashion", "Kid's Fashion",
    "Footwears", "Bags & Accessories", "Bedsheets & Towels", "Personal Care",
    "Household", "Electronics", "Foods & Grocery", "Home & Kitchen",
    "Paint & Construction", "Agriculture", "Stationery"
];

const SKELETON_COUNT = 8;
const SKELETONS = Array.from({ length: SKELETON_COUNT }, (_, i) => i);
const MORE_SKELETONS = SKELETONS.slice(0, 4);

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
            <div className="pv-thumb-fallback" style={{ '--h': hueOf(title) }}>
                <Film size={30} strokeWidth={1.6} />
            </div>
        );
    }

    return (
        <img
            className="pv-thumb-img"
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

const VideoCard = memo(({ video, index, onSelect }) => {
    const { id, chain } = useMemo(() => buildThumbChain(video), [video]);
    const duration = formatDuration(video.duration);

    return (
        <article className="pv-card" style={{ '--i': index % 8 }}>
            <button
                type="button"
                className="pv-card-btn"
                onClick={() => onSelect(video)}
                aria-label={`Play ${video.title}`}
            >
                <span className="pv-thumb">
                    <Thumb chain={chain} title={video.title} eager={index < 4} />
                    <span className="pv-thumb-shade" />
                    <span className="pv-play"><Play size={22} fill="currentColor" strokeWidth={0} /></span>
                    {id && <span className="pv-badge pv-badge-hd">HD</span>}
                    {duration && <span className="pv-badge pv-badge-time">{duration}</span>}
                </span>
                <span className="pv-card-info">
                    <span className="pv-card-title">{video.title}</span>
                    <span className="pv-chip">
                        <BadgeCheck size={14} />
                        {video.category ? video.category : 'RCM Video'}
                    </span>
                </span>
            </button>
        </article>
    );
});

const SkeletonCard = memo(() => (
    <div className="pv-card pv-skel" aria-hidden="true">
        <div className="pv-thumb pv-shimmer" />
        <div className="pv-skel-lines">
            <i className="pv-shimmer" />
            <i className="pv-shimmer is-short" />
        </div>
    </div>
));

const CategoryTabs = memo(({ selected, onSelect }) => {
    const railRef = useRef(null);

    const handleClick = useCallback((cat, e) => {
        onSelect(cat);
        const rail = railRef.current;
        const btn = e.currentTarget;
        if (rail && btn) {
            rail.scrollTo({
                left: btn.offsetLeft - (rail.clientWidth - btn.offsetWidth) / 2,
                behavior: 'smooth'
            });
        }
    }, [onSelect]);

    return (
        <div className="pv-rail" ref={railRef} role="tablist" aria-label="Product categories">
            {productCategories.map((cat) => (
                <button
                    key={cat}
                    type="button"
                    role="tab"
                    aria-selected={selected === cat}
                    className={`pv-pill ${selected === cat ? 'is-active' : ''}`}
                    onClick={(e) => handleClick(cat, e)}
                >
                    {cat}
                </button>
            ))}
        </div>
    );
});

const StateBlock = memo(({ kind, message, onPrimary, primaryLabel }) => (
    <div className="pv-state" role={kind === 'error' ? 'alert' : undefined}>
        <svg className="pv-state-art" viewBox="0 0 160 120" fill="none" aria-hidden="true">
            <rect x="14" y="22" width="108" height="72" rx="14" stroke="currentColor" strokeWidth="2" opacity="0.35" />
            <path d="M58 44l28 14-28 14V44z" fill="currentColor" opacity="0.5" />
            <circle cx="118" cy="82" r="20" fill="#07080c" stroke="#9b6dff" strokeWidth="3" />
            <path d="M133 97l14 14" stroke="#9b6dff" strokeWidth="3.5" strokeLinecap="round" />
            {kind === 'error' && <path d="M111 75l14 14M125 75l-14 14" stroke="#fb7185" strokeWidth="2.5" strokeLinecap="round" />}
        </svg>
        <h3>{kind === 'error' ? 'Something went wrong' : 'No product videos found'}</h3>
        <p>{message}</p>
        {onPrimary && (
            <button type="button" className="pv-btn" onClick={onPrimary}>
                <RotateCcw size={16} /> {primaryLabel}
            </button>
        )}
    </div>
));

/* ------------------------------ player modal ------------------------------ */

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const CLOSE_MS = 200;

const ProductVideoModal = ({ video, onClose }) => {
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
    const channel = video.channelName || video.channel || 'RCM Official';
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
            className={`pv-modal ${closing ? 'is-closing' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={video.title}
            onClick={requestClose}
        >
            <div className="pv-sheet" ref={dialogRef} onClick={(e) => e.stopPropagation()}>
                <div className="pv-player">
                    {embedUrl ? (
                        <iframe
                            className="pv-iframe"
                            src={embedUrl}
                            title={video.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            referrerPolicy="strict-origin-when-cross-origin"
                        />
                    ) : video.videoUrl ? (
                        <video
                            className="pv-iframe"
                            src={video.videoUrl}
                            poster={video.thumbnailUrl}
                            controls
                            autoPlay
                            playsInline
                        />
                    ) : (
                        <div className="pv-player-empty">This video is unavailable right now.</div>
                    )}
                    {embedUrl && <span className="pv-player-blocker" aria-hidden="true" />}
                    <button type="button" className="pv-close" ref={closeRef} onClick={requestClose} aria-label="Close video">
                        <X size={20} />
                    </button>
                </div>

                <div className="pv-info">
                    <h2 className="pv-info-title">{video.title}</h2>

                    <div className="pv-meta">
                        <span className="pv-chip is-solid">
                            <BadgeCheck size={14} />
                            {video.category ? video.category : 'RCM Video'}
                        </span>
                        <span className="pv-channel">
                            {channel}
                            <BadgeCheck size={15} className="pv-verified" aria-label="Verified" />
                        </span>
                    </div>

                    <div className="pv-actions">
                        <button type="button" className="pv-btn is-ghost" onClick={handleShare}>
                            {copied ? <Check size={16} /> : <Share2 size={16} />}
                            {copied ? 'Link copied' : canNativeShare ? 'Share' : 'Copy link'}
                        </button>
                    </div>

                    {video.description && <p className="pv-desc">{video.description}</p>}
                </div>
            </div>
        </div>,
        document.body
    );
};

/* ---------------------------------- page ---------------------------------- */

function Productsvideo({ pageTitle }) {
    const [allVideos, setAllVideos] = useState([]);
    const [activeVideo, setActiveVideo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const [selectedCategory, setSelectedCategory] = useState('All');

    const { accessToken, API_URL } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    const reqId = useRef(0); // ignores late responses from an older category / page
    const probeRef = useRef(null);
    const stickyRef = useRef(null);
    const sentinelRef = useRef(null);

    const fetchVideos = useCallback(async (pageNum, isInitialLoad = false, category = selectedCategory) => {
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
        let url = `${API_URL}/api/videos/products?page=${pageNum}&limit=${limit}`;

        if (category !== 'All') {
            url += `&category=${encodeURIComponent(category)}`;
        }

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
    }, [accessToken, API_URL, selectedCategory]);

    useEffect(() => {
        if (accessToken && API_URL) {
            setPage(1);
            setAllVideos([]);
            setHasMore(true);

            if (location.state && location.state.selectedVideo) {
                setActiveVideo(location.state.selectedVideo);
                navigate(location.pathname, { replace: true, state: {} });
            }

            fetchVideos(1, true, selectedCategory);
        }
    }, [accessToken, API_URL, selectedCategory, location.state, navigate, fetchVideos]);

    const filteredVideos = useMemo(() => {
        if (!debouncedSearchTerm) return allVideos;
        return allVideos.filter(video =>
            video.title.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
            (video.category && video.category.toLowerCase().includes(debouncedSearchTerm.toLowerCase()))
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
            fetchVideos(page + 1, false, selectedCategory);
        }
    }, [page, loadingMore, hasMore, fetchVideos, selectedCategory]);

    const handleCategorySelect = useCallback((category) => {
        if (category === selectedCategory) return; // tapping the active pill must not wipe the list
        setSelectedCategory(category);
        setPage(1);
        setAllVideos([]);
        setHasMore(true);
        setActiveVideo(null);
        setSearchTerm('');
    }, [selectedCategory]);

    const handleResetFilters = useCallback(() => {
        setSearchTerm('');
        if (selectedCategory !== 'All') handleCategorySelect('All');
    }, [selectedCategory, handleCategorySelect]);

    const handleRetry = useCallback(() => {
        if (allVideos.length === 0) fetchVideos(1, true, selectedCategory);
        else fetchVideos(page + 1, false, selectedCategory);
    }, [allVideos.length, page, fetchVideos, selectedCategory]);

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

    // Sticky category bar: add a soft edge once the page has scrolled under it.
    // Toggles a class on the DOM directly, so scrolling never re-renders React.
    useEffect(() => {
        const probe = probeRef.current;
        const bar = stickyRef.current;
        if (!probe || !bar || typeof IntersectionObserver === 'undefined') return undefined;

        const io = new IntersectionObserver(([entry]) => {
            bar.classList.toggle('is-stuck', !entry.isIntersecting && entry.boundingClientRect.top < 0);
        }, { threshold: [0] });

        io.observe(probe);
        return () => io.disconnect();
    }, []);

    const showSkeleton = loading && allVideos.length === 0;
    const showFullError = !loading && !!error && allVideos.length === 0;
    const showEmpty = !loading && !error && filteredVideos.length === 0;
    const hasFilters = Boolean(debouncedSearchTerm) || selectedCategory !== 'All';

    return (
        <div className="pv-page">
            <div className="pv-wrap pv-head">
                <div className="pv-title-row">
                    <button type="button" onClick={() => navigate('/dashboard')} className="pv-back" aria-label="Back to dashboard">
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="pv-title">{pageTitle || "Product Videos"}</h1>
                </div>

                <div className="pv-search">
                    <Search size={19} className="pv-search-icon" />
                    <input
                        type="text"
                        inputMode="search"
                        enterKeyHint="search"
                        value={searchTerm}
                        onChange={handleSearchChange}
                        placeholder="Search product videos"
                        className="pv-search-input"
                        aria-label="Search product videos"
                    />
                    {searchTerm && (
                        <button type="button" className="pv-search-clear" onClick={handleClearSearch} aria-label="Clear search">
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            <div ref={probeRef} className="pv-probe" aria-hidden="true" />

            <div className="pv-sticky" ref={stickyRef}>
                <div className="pv-wrap pv-rail-wrap">
                    <CategoryTabs selected={selectedCategory} onSelect={handleCategorySelect} />
                </div>
            </div>

            <main className="pv-wrap pv-main" aria-busy={loading || loadingMore}>
                {showFullError && (
                    <StateBlock kind="error" message={error} onPrimary={handleRetry} primaryLabel="Try again" />
                )}

                {!showFullError && (
                    <div className="pv-grid">
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
                        message={hasFilters ? 'Try a different word or clear the filters.' : 'New videos will show up here soon.'}
                        onPrimary={hasFilters ? handleResetFilters : undefined}
                        primaryLabel="Reset filters"
                    />
                )}

                {!showFullError && !!error && allVideos.length > 0 && (
                    <div className="pv-inline-error" role="alert">
                        <span>{error}</span>
                        <button type="button" className="pv-btn is-ghost" onClick={handleRetry}>Retry</button>
                    </div>
                )}

                {hasMore && !debouncedSearchTerm && allVideos.length > 0 && (
                    <div className="pv-more-wrap">
                        <div ref={sentinelRef} className="pv-sentinel" aria-hidden="true" />
                        <button type="button" className="pv-more" onClick={handleLoadMore} disabled={loadingMore}>
                            {loadingMore ? <><span className="pv-spinner" /> Loading</> : 'Load more videos'}
                        </button>
                    </div>
                )}
            </main>

            <ProductVideoModal video={activeVideo} onClose={handleCloseModal} />
        </div>
    );
}

export default Productsvideo;