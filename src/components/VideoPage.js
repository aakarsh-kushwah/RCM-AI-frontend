// src/components/VideoPage.js

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom'; // ✅ चैट से वीडियो चलाने के लिए
import './VideoPage.css';
import { Search, PlayCircle, X } from 'lucide-react';

// --- ✅ हाई-ट्रैफ़िक ऑप्टिमाइज़ेशन: Debounce हुक ---
// यह सर्च को लैग-फ्री बनाता है
function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
        return () => { clearTimeout(handler); };
    }, [value, delay]);
    return debouncedValue;
}

// --- Memoized कंपोनेंट्स (परफॉरमेंस के लिए) ---
const VideoSidebarItem = React.memo(({ video, onVideoSelect, isActive }) => {
    const thumbnailUrl = video.thumbnailUrl; 
    return (
        <div 
            className={`video-list-item ${isActive ? 'active' : ''}`} 
            onClick={() => onVideoSelect(video)}
        >
            <div className="item-thumbnail">
                {thumbnailUrl ? <img src={thumbnailUrl} alt={video.title} /> : <PlayCircle size={40} />}
            </div>
            <div className="item-details">
                <h4 className="item-title">{video.title}</h4>
                <p className="item-subtitle">RCM Leader</p>
            </div>
        </div>
    );
});

const VideoGridItem = React.memo(({ video, onVideoSelect }) => (
    <div className="video-grid-item" onClick={() => onVideoSelect(video)}>
        <div className="grid-item-thumbnail">
            {video.thumbnailUrl ? (
                 <img src={video.thumbnailUrl} alt={video.title} />
            ) : (
                <div className="thumbnail-placeholder"><PlayCircle size={40} /></div>
            )}
        </div>
        <div className="grid-item-details">
            <h4 className="grid-item-title">{video.title}</h4>
            <p className="grid-item-subtitle">RCM Leader</p>
        </div>
    </div>
));


// --- मुख्य VideoPage कंपोनेंट ---
function VideoPage({ pageTitle, videoType }) {
    const [allVideos, setAllVideos] = useState([]);
    const [selectedVideo, setSelectedVideo] = useState(null); 
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 300); // ✅ डिबाउंस्ड वैल्यू
    
    const [isMiniPlayer, setIsMiniPlayer] = useState(false);
    
    // ✅ हाई-ट्रैफ़िक ऑप्टिमाइज़ेशन: पेजिनेशन (Pagination)
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const { token, API_URL } = useAuth();
    
    // ✅ चैट से भेजे गए वीडियो को पकड़ने के लिए
    const location = useLocation();
    const navigate = useNavigate();

    // --- API कॉल (पेजिनेशन के साथ) ---
    const fetchVideos = useCallback(async (pageNum, isInitialLoad = false) => {
        if (isInitialLoad) setLoading(true); else setLoadingMore(true);
        setError('');
        
        const limit = 20; // ⚠️ हाई-ट्रैफ़िक: एक बार में सिर्फ 20 वीडियो
        const url = `${API_URL}/api/videos/${videoType}?page=${pageNum}&limit=${limit}`;

        try {
            const response = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
            if (response.data.success && Array.isArray(response.data.data)) {
                const newData = response.data.data;
                
                // नए वीडियो को पुरानी लिस्ट में जोड़ें
                setAllVideos(prev => isInitialLoad ? newData : [...prev, ...newData]);
                
                // अगर यह पहला लोड है, तो पहला वीडियो चुनें
                if (isInitialLoad && newData.length > 0 && !selectedVideo) {
                    setSelectedVideo(newData[0]);
                }
                
                setHasMore(newData.length === limit); // क्या और वीडियो हैं?
            } else {
                if (isInitialLoad) setAllVideos([]);
                setHasMore(false);
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load videos.');
        } finally {
            if (isInitialLoad) setLoading(false); else setLoadingMore(false);
        }
    }, [videoType, token, API_URL, selectedVideo]);

    // --- आरम्भिक (Initial) डेटा लोड ---
    useEffect(() => {
        if (token && API_URL) {
            setPage(1); 
            setHasMore(true);
            
            // ✅ चैट से आया वीडियो चेक करें
            if (location.state && location.state.selectedVideo) {
                // अगर वीडियो चैट से आया है, तो उसे चुनें
                setSelectedVideo(location.state.selectedVideo);
                // और बाकी वीडियो लोड करें
                fetchVideos(1, true); 
                // state को साफ़ करें ताकि रिफ्रेश करने पर यह दोबारा न हो
                navigate(location.pathname, { replace: true, state: {} });
            } else {
                // अगर चैट से नहीं आया, तो नॉर्मल लोड करें
                fetchVideos(1, true);
            }
        }
    }, [fetchVideos, token, API_URL, location.state, navigate, location.pathname]);


    // --- फिल्टर्ड वीडियो (डिबाउंस्ड) ---
    const filteredVideos = useMemo(() => {
        if (!debouncedSearchTerm) {
            return allVideos; 
        }
        return allVideos.filter(video =>
            video.title.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
        );
    }, [allVideos, debouncedSearchTerm]);


    // --- इवेंट हैंडलर्स (useCallback के साथ ऑप्टिमाइज़) ---
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
            fetchVideos(nextPage, false); // अगला पेज मंगाएँ
        }
    }, [page, loadingMore, hasMore, fetchVideos]);

    return (
        <div className="leader-video-page">
            <div className="page-header">
                <h1 className="page-main-title">{pageTitle}</h1>
                <div className="search-bar-container">
                    <span className="search-icon"><Search size={20} /></span>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={handleSearchChange}
                        onFocus={handleSearchFocus}
                        placeholder="Search..."
                        className="search-input"
                    />
                </div>
            </div>

            <div className="main-content-layout">
                {/* --- 1. मुख्य वीडियो कॉलम (बायाँ हिस्सा) --- */}
                <div className="video-player-column">
                    {isMiniPlayer ? (
                        // --- 1A. सर्च रिजल्ट ग्रिड ---
                        <div className="search-results-main">
                            <h2 className="sidebar-title">
                                {debouncedSearchTerm ? `Results for "${debouncedSearchTerm}"` : "All Videos"}
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
                            {/* "Load More" बटन सिर्फ़ तब दिखे जब सर्च न कर रहे हों */}
                            {hasMore && !debouncedSearchTerm && (
                                <button className="load-more-btn" onClick={handleLoadMore} disabled={loadingMore}>
                                    {loadingMore ? 'Loading...' : 'Load More'}
                                </button>
                            )}
                        </div>
                    ) : (
                        // --- 1B. बड़ा प्लेयर ---
                        <>
                            {loading && <div className="video-skeleton-loader"></div>}
                            {error && <div className="video-error-message">{error}</div>}
                            {!selectedVideo && !loading && !error && (
                                <div className="video-error-message">Please select a video.</div>
                            )}
                            {selectedVideo && !loading && (
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
                                        <div className="iframe-click-blocker"></div>
                                        <div className="video-watermark-logo">
                                            <img src="/rcm-ai-logo.png" alt="RCM AI" />
                                        </div>
                                    </div>
                                    <div className="video-details-container">
                                        <h2 className="video-title">{selectedVideo.title}</h2>
                                        <p className="video-motivation-quote">
                                            "सफलता की इस कहानी से सीखें और अपने बिज़नेस को आगे बढ़ाएं।"
                                        </p>
                                        <div className="video-description">
                                            <p>{selectedVideo.description || 'Leader biography and key achievements will be displayed here.'}</p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>

                {/* --- 2. साइडबार वीडियो लिस्ट (दायाँ हिस्सा) --- */}
                <div className="video-sidebar-column">
                    <h3 className="sidebar-title">All Videos</h3>
                    <div className="video-list-scroll">
                        {loading && !loadingMore && <p className="sidebar-message">Loading list...</p>}
                        
                        {filteredVideos.map((video) => (
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
                    </div>
                </div>
            </div>

            {/* --- 3. मिनी-प्लेयर --- */}
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
                        <p className="mini-player-subtitle">RCM Leader</p>
                    </div>
                    <button className="mini-player-close" onClick={closeMiniPlayer}>
                        <X size={20} />
                    </button>
                </div>
            )}
        </div>
    );
}

export default VideoPage;