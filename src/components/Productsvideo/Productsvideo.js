import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import './Productsvideo.css'; 
import { Search, PlayCircle, X, ArrowLeft } from 'lucide-react';

// --- Category List (Unchanged) ---
const productCategories = [
    "All",
    "Health Care", "Men's Fashion", "Women's Fashion", "Kid's Fashion",
    "Footwears", "Bags & Accessories", "Bedsheets & Towels", "Personal Care",
    "Household", "Electronics", "Foods & Grocery", "Home & Kitchen",
    "Paint & Construction", "Agriculture", "Stationery"
];

// --- Debounce Hook (Unchanged) ---
function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
        return () => { clearTimeout(handler); };
    }, [value, delay]);
    return debouncedValue;
}

// --- ⭐️ NAYA: Sidebar Skeleton Loader ---
const SkeletonSidebarItem = () => (
  <div className="video-list-item skeleton">
    <div className="item-thumbnail skeleton-box"></div>
    <div className="item-details">
      <div className="item-title skeleton-box skeleton-title"></div>
      <div className="item-subtitle skeleton-box skeleton-subtitle"></div>
    </div>
  </div>
);


// --- Memoized Components (⭐️ UPDATED) ---
const VideoSidebarItem = React.memo(({ video, onVideoSelect, isActive }) => {
    const thumbnailUrl = video.thumbnailUrl; 
    return (
        <div 
            className={`video-list-item ${isActive ? 'active' : ''}`} 
            onClick={() => onVideoSelect(video)}
        >
            <div className="item-thumbnail">
                {thumbnailUrl ? (
                    // ⭐️ UPDATE: Added loading="lazy", width, height
                    <img 
                      src={thumbnailUrl} 
                      alt={video.title} 
                      onError={(e) => e.target.src = 'https://placehold.co/120x68/e0e0e0/777?text=RCM'} 
                      loading="lazy"
                      width="120"
                      height="68"
                    />
                ) : <PlayCircle size={40} />}
            </div>
            <div className="item-details">
                <h4 className="item-title">{video.title}</h4>
                <p className="item-subtitle">{video.category ? video.category : 'RCM Video'}</p>
            </div>
        </div>
    );
});

const VideoGridItem = React.memo(({ video, onVideoSelect }) => (
    <div className="video-grid-item" onClick={() => onVideoSelect(video)}>
        <div className="grid-item-thumbnail">
            {video.thumbnailUrl ? (
                 // ⭐️ UPDATE: Added loading="lazy", width, height
                 <img 
                   src={video.thumbnailUrl} 
                   alt={video.title} 
                   onError={(e) => e.target.src = 'https://placehold.co/320x180/e0e0e0/777?text=RCM'} 
                   loading="lazy"
                   width="320"
                   height="180"
                 />
            ) : (
                 <div className="thumbnail-placeholder"><PlayCircle size={40} /></div>
            )}
        </div>
        <div className="grid-item-details">
            <h4 className="grid-item-title">{video.title}</h4>
            <p className="grid-item-subtitle">{video.category ? video.category : 'RCM Video'}</p>
        </div>
    </div>
));


// --- Mukhya Component (Main Logic Unchanged) ---
function Productsvideo({ pageTitle }) {
    const [allVideos, setAllVideos] = useState([]);
    const [selectedVideo, setSelectedVideo] = useState(null); 
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 300);
    
    const [isMiniPlayer, setIsMiniPlayer] = useState(false);
    
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const [selectedCategory, setSelectedCategory] = useState('All');

    const { token, API_URL } = useAuth(); 
    
    const location = useLocation();
    const navigate = useNavigate();

    // --- API Call (Unchanged) ---
    const fetchVideos = useCallback(async (pageNum, isInitialLoad = false, category = selectedCategory) => {
        if (!token || !API_URL) {
             setError("Authentication error. Please log in again.");
             setLoading(false);
             return;
        }
        
        if (isInitialLoad) setLoading(true); else setLoadingMore(true);
        setError('');
        
        const limit = 20;
        
        let url = `${API_URL}/api/videos/products?page=${pageNum}&limit=${limit}`;
        
        if (category !== 'All') {
            url += `&category=${encodeURIComponent(category)}`;
        }

        try {
            const response = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
            
            if (response.data.success && Array.isArray(response.data.data)) {
                const newData = response.data.data;
                setAllVideos(prev => isInitialLoad ? newData : [...prev, ...newData]);
                
                if (isInitialLoad && newData.length > 0 && !selectedVideo) {
                    if (location.state && location.state.selectedVideo) {
                        setSelectedVideo(location.state.selectedVideo);
                    } else {
                        setSelectedVideo(newData[0]);
                    }
                }
                
                setHasMore(response.data.pagination.currentPage < response.data.pagination.totalPages); 
            } else {
                if (isInitialLoad) setAllVideos([]);
                setHasMore(false);
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load videos.');
        } finally {
            if (isInitialLoad) setLoading(false); else setLoadingMore(false);
        }
    }, [token, API_URL, selectedVideo, selectedCategory, location.state]);

    // --- Initial Data Load (Unchanged) ---
    useEffect(() => {
        if (token && API_URL) {
            setPage(1); 
            setAllVideos([]);
            setHasMore(true);
            
            let initialVideo = null;
            if (location.state && location.state.selectedVideo) {
                 setSelectedVideo(location.state.selectedVideo);
                 initialVideo = location.state.selectedVideo;
                 navigate(location.pathname, { replace: true, state: {} });
            }
            
            fetchVideos(1, true, selectedCategory).then(() => {
                 if (initialVideo) {
                     setSelectedVideo(initialVideo);
                 }
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, API_URL, selectedCategory]); 


    // --- Filtered Videos (Unchanged) ---
    const filteredVideos = useMemo(() => {
        if (!debouncedSearchTerm) {
            return allVideos; 
        }
        return allVideos.filter(video =>
            video.title.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
        );
    }, [allVideos, debouncedSearchTerm]);


    // --- Event Handlers (Unchanged) ---
    const handleSearchChange = useCallback((e) => {
        setSearchTerm(e.target.value);
        if (selectedVideo) setIsMiniPlayer(true);
    }, [selectedVideo]);

    const handleSearchFocus = useCallback(() => {
        if (selectedVideo) setIsMiniPlayer(true);
    }, [selectedVideo]);

    const handleVideoSelect = useCallback((video) => {
        setSelectedVideo(video);
        setIsMiniPlayer(false); 
        setSearchTerm(''); 
        window.scrollTo(0, 0); 
    }, []);

    const closeMiniPlayer = useCallback((e) => {
        e.stopPropagation(); 
        setIsMiniPlayer(false);
        setSelectedVideo(null); 
    }, []);

    const maximizePlayer = useCallback(() => {
        setIsMiniPlayer(false);
        window.scrollTo(0, 0);
    }, []);

    const handleLoadMore = useCallback(() => {
        if (!loadingMore && hasMore) {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchVideos(nextPage, false, selectedCategory);
        }
    }, [page, loadingMore, hasMore, fetchVideos, selectedCategory]);

    const handleCategorySelect = useCallback((category) => {
        setSelectedCategory(category);
        setPage(1);
        setAllVideos([]);
        setHasMore(true);
        setSelectedVideo(null);
        setIsMiniPlayer(false);
        setSearchTerm('');
    }, []);

    // --- JSX Return (⭐️ UPDATED) ---
    return (
        <div className="product-video-page"> 
            <div className="page-header">
                <button onClick={() => navigate('/dashboard')} className="back-to-dashboard">
                    <ArrowLeft size={20} /> Back
                </button>
                <h1 className="page-main-title">{pageTitle || "Product Videos"}</h1>
                
                <div className="search-bar-container">
                    <span className="search-icon"><Search size={20} /></span>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={handleSearchChange}
                        onFocus={handleSearchFocus}
                        placeholder="Search Videos..."
                        className="search-input"
                    />
                </div>
            </div>

            <div className="category-cards-container">
                <div className="category-cards-scroll">
                    {productCategories.map(cat => (
                        <button
                            key={cat}
                            className={`category-card ${selectedCategory === cat ? 'active' : ''}`}
                            onClick={() => handleCategorySelect(cat)}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            <div className="main-content-layout">
                {/* --- 1. Mukhya Video Column --- */}
                <div className="video-player-column">
                    {isMiniPlayer ? (
                        // --- 1A. Search Result Grid ---
                        <div className="search-results-main">
                            <h2 className="sidebar-title">
                                {debouncedSearchTerm ? `Results for "${debouncedSearchTerm}"` : `All ${selectedCategory !== 'All' ? selectedCategory : ''} Videos`}
                            </h2>
                            <div className="results-grid">
                                {filteredVideos.length > 0 ? (
                                    filteredVideos.map((video) => (
                                        <VideoGridItem
                                            key={video.id || video.publicId}
                                            video={video}
                                            onVideoSelect={handleVideoSelect}
                                        />
                                    ))
                                ) : (
                                    <p className="sidebar-message">No videos found.</p>
                                )}
                            </div>
                            {hasMore && !debouncedSearchTerm && (
                                <button className="load-more-btn" onClick={handleLoadMore} disabled={loadingMore}>
                                    {loadingMore ? 'Loading...' : 'Load More'}
                                </button>
                            )}
                        </div>
                    ) : (
                        // --- 1B. Bada Player ---
                        <>
                            {/* ⭐️ UPDATE: Skeleton loader CSS class pehle se hi yahaan tha, perfect! */}
                            {loading && <div className="video-skeleton-loader"></div>}
                            {error && <div className="video-error-message">{error}</div>}
                            {!selectedVideo && !loading && !error && allVideos.length === 0 && (
                                <div className="video-error-message">
                                    {`No videos found${selectedCategory !== 'All' ? ` for "${selectedCategory}"` : ' for this category'}.`}
                                </div>
                            )}
                            {selectedVideo && ( 
                                <>
                                    <div className="video-player-wrapper">
                                        <iframe
                                            className="video-iframe"
                                            src={`https://www.youtube.com/embed/${selectedVideo.publicId}?autoplay=1&controls=1&modestbranding=1&rel=0`}
                                            title={selectedVideo.title}
                                            frameBorder="0"
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                            allowFullScreen
                                            key={selectedVideo.publicId}
                                        ></iframe>
                                        <div className="iframe-top-blocker"></div> 
                                        <div className="video-watermark-logo">
                                        <img src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" alt="RCM AI" />
                                        </div>
                                    </div>
                                    <div className="video-details-container">
                                        <h2 className="video-title">{selectedVideo.title}</h2>
                                        {selectedVideo.category && (
                                            <span className='video-category-tag'>{selectedVideo.category}</span>
                                        )}
                                        
                                        <div className="video-description">
                                            <p>{selectedVideo.description || 'Video description will be displayed here.'}</p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>

                {/* --- 2. Sidebar Video List --- */}
                <div className="video-sidebar-column">
                    <h3 className="sidebar-title">
                        {selectedCategory !== 'All' ? `${selectedCategory} Videos` : 'All Videos'}
                    </h3>
                    <div className="video-list-scroll">
                        
                        {/* ⭐️ UPDATE: Replaced "Loading list..." with Skeleton Loaders */}
                        {loading && !loadingMore && allVideos.length === 0 && (
                          <>
                            <SkeletonSidebarItem />
                            <SkeletonSidebarItem />
                            <SkeletonSidebarItem />
                            <SkeletonSidebarItem />
                            <SkeletonSidebarItem />
                          </>
                        )}
                        
                        {!loading && filteredVideos.map((video) => (
                            <VideoSidebarItem
                                key={video.id || video.publicId}
                                video={video}
                                onVideoSelect={handleVideoSelect}
                                isActive={!isMiniPlayer && selectedVideo?.publicId === video.publicId}
                            />
                        ))}
                        
                        {hasMore && !debouncedSearchTerm && (
                            <button className="load-more-btn" onClick={handleLoadMore} disabled={loadingMore}>
                                {loadingMore ? 'Loading...' : 'Load More'}
                            </button>
                        )}
                        {!hasMore && !loading && allVideos.length > 0 && (
                            <p className="sidebar-message">No more videos.</p>
                        )}
                        {!loading && allVideos.length === 0 && (
                             <p className="sidebar-message">No videos found.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* --- 3. Mini-Player (Unchanged) --- */}
            {isMiniPlayer && selectedVideo && (
                <div className="mini-player" onClick={maximizePlayer}>
                    <div className="mini-player-video-wrapper">
                        <iframe
                            className="video-iframe"
                            src={`https://www.youtube.com/embed/${selectedVideo.publicId}?autoplay=1&controls=0&modestbranding=1&rel=0`}
                            title={selectedVideo.title}
                            frameBorder="0"
                            allow="autoplay"
                        ></iframe>
                    </div>
                    <div className="mini-player-details">
                        <p className="mini-player-title">{selectedVideo.title}</p>
                        <p className="mini-player-subtitle">{selectedVideo.category || 'RCM Video'}</p>
                    </div>
                    <button className="mini-player-close" onClick={closeMiniPlayer}>
                        <X size={20} />
                    </button>
                </div>
            )}
        </div>
    );
}

export default Productsvideo;