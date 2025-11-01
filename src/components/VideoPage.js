// src/components/VideoPage.js
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './VideoPage.css';
import { Search, PlayCircle, X } from 'lucide-react';

// --- ✅ ऑप्टिमाइज़ेशन: Debounce हुक ---
// यह सर्च इनपुट को लैग-फ्री बनाता है
function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
}

// --- ✅ ऑप्टिमाइज़ेशन: Memoization ---
const VideoSidebarItem = React.memo(({ video, onVideoSelect, isActive }) => {
    // ... (यह कंपोनेंट बदला नहीं है) ...
    const thumbnailUrl = video.thumbnailUrl; 
    return (
        <div 
            className={`video-list-item ${isActive ? 'active' : ''}`} 
            onClick={() => onVideoSelect(video)}
        >
            <div className="item-thumbnail">
                {thumbnailUrl ? (
                    <img src={thumbnailUrl} alt={video.title} />
                ) : (
                    <PlayCircle size={40} />
                )}
            </div>
            <div className="item-details">
                <h4 className="item-title">{video.title}</h4>
                <p className="item-subtitle">RCM Leader</p>
            </div>
        </div>
    );
});

// --- ✅ ऑप्टिमाइज़ेशन: Memoization ---
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
    
    // सर्च स्टेट
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 300); // ✅ डिबाउंस्ड वैल्यू
    
    // मिनी-प्लेयर स्टेट
    const [isMiniPlayer, setIsMiniPlayer] = useState(false);
    
    // ✅ पेजिनेशन (Pagination) स्टेट
    const [page, setPage] = useState(1); // वर्तमान पेज
    const [hasMore, setHasMore] = useState(true); // क्या और वीडियो हैं?
    const [loadingMore, setLoadingMore] = useState(false); // "Load More" के लिए लोडर

    const { token, API_URL } = useAuth();

    // --- ✅ ऑप्टिमाइज़ेशन: API कॉल को useCallback में रैप किया ---
    const fetchVideos = useCallback(async (pageNum, isInitialLoad = false) => {
        if (isInitialLoad) setLoading(true); else setLoadingMore(true);
        setError('');
        
        // ⚠️ HEAVY TRAFFIC: 'page' और 'limit' बहुत ज़रूरी हैं।
        // आपके बैकएंड (API) को इन्हें सपोर्ट करना चाहिए।
        const limit = 20; // एक बार में 20 वीडियो
        const url = `${API_URL}/api/videos/${videoType}?page=${pageNum}&limit=${limit}`;

        try {
            const response = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
            
            if (response.data.success && Array.isArray(response.data.data)) {
                const newData = response.data.data;
                
                if (isInitialLoad) {
                    // पहली बार लोड
                    setAllVideos(newData);
                    if (newData.length > 0) setSelectedVideo(newData[0]);
                } else {
                    // "Load More" क्लिक पर
                    setAllVideos(prev => [...prev, ...newData]);
                }
                
                // अगर API से 'limit' से कम वीडियो आए, मतलब और वीडियो नहीं हैं
                setHasMore(newData.length === limit); 
            } else {
                if (isInitialLoad) setAllVideos([]);
                setHasMore(false);
            }
        } catch (err) {
            console.error(`Error fetching ${videoType} videos:`, err);
            setError(err.response?.data?.message || 'Failed to load videos.');
        } finally {
            if (isInitialLoad) setLoading(false); else setLoadingMore(false);
        }
    }, [videoType, token, API_URL]); // ये बदलने पर ही फ़ंक्शन दोबारा बनेगा

    // --- आरम्भिक (Initial) डेटा लोड ---
    useEffect(() => {
        if (token && API_URL) {
            setPage(1); // पेज रीसेट करें
            setHasMore(true);
            fetchVideos(1, true); // पेज 1 मंगाएँ (शुरुआती लोड)
        }
    }, [fetchVideos, token, API_URL]); // `fetchVideos` अब एक dependency है


    // --- फिल्टर्ड वीडियो (डिबाउंस्ड) ---
    const filteredVideos = useMemo(() => {
        if (!debouncedSearchTerm) {
            return allVideos; // अगर सर्च खाली है, तो सारे दिखाएँ
        }
        return allVideos.filter(video =>
            video.title.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
        );
    }, [allVideos, debouncedSearchTerm]); // ✅ `debouncedSearchTerm` का उपयोग करें


    // --- ✅ ऑप्टिमाइज़ेशन: सभी इवेंट हैंडलर्स को useCallback में रैप किया ---

    const handleSearchChange = useCallback((e) => {
        setSearchTerm(e.target.value);
        if (selectedVideo) {
            setIsMiniPlayer(true); // मिनी-प्लेयर सक्रिय करें
        }
    }, [selectedVideo]);

    const handleSearchFocus = useCallback(() => {
        if (selectedVideo) {
            setIsMiniPlayer(true); // मिनी-प्लेयर सक्रिय करें
        }
    }, [selectedVideo]);

    const handleVideoSelect = useCallback((video) => {
        setSelectedVideo(video);
        setIsMiniPlayer(false); // मिनी-प्लेयर बंद करें
        setSearchTerm(''); // सर्च साफ़ करें
        window.scrollTo(0, 0); // पेज ऊपर स्क्रॉल करें
    }, []);

    const closeMiniPlayer = useCallback((e) => {
        e.stopPropagation(); 
        setIsMiniPlayer(false);
        setSelectedVideo(null); // वीडियो को पूरी तरह बंद करें
    }, []);

    const maximizePlayer = useCallback(() => {
        setIsMiniPlayer(false);
        window.scrollTo(0, 0);
    }, []);

    // "Load More" बटन का हैंडलर
    const handleLoadMore = useCallback(() => {
        if (!loadingMore && hasMore) {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchVideos(nextPage, false); // अगला पेज मंगाएँ
        }
    }, [page, loadingMore, hasMore, fetchVideos]);


    // --- रेंडर ---
    return (
        <div className="leader-video-page">
            
            {/* --- हेडर --- */}
            <div className="page-header">
                <h1 className="page-main-title">{pageTitle}</h1>
                <div className="search-bar-container">
                    <span className="search-icon"><Search size={20} /></span>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={handleSearchChange}
                        onFocus={handleSearchFocus}
                        placeholder="Search leaders..."
                        className="search-input"
                    />
                </div>
            </div>

            {/* --- मुख्य कंटेंट (2-कॉलम लेआउट) --- */}
            <div className="main-content-layout">

                {/* --- 1. मुख्य वीडियो कॉलम (बायाँ हिस्सा) --- */}
                <div className="video-player-column">
                    
                    {isMiniPlayer ? (
                        // --- 1A. जब यूज़र सर्च कर रहा है: सर्च रिजल्ट ग्रिड ---
                        <div className="search-results-main">
                            <h2 className="sidebar-title">
                                {debouncedSearchTerm ? `Results for "${debouncedSearchTerm}"` : "All Leaders"}
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
                                    <p className="sidebar-message">No leaders found.</p>
                                )}
                            </div>
                            {/* ✅ ग्रिड के लिए "Load More" बटन */}
                            {hasMore && !debouncedSearchTerm && (
                                <button className="load-more-btn" onClick={handleLoadMore} disabled={loadingMore}>
                                    {loadingMore ? 'Loading...' : 'Load More'}
                                </button>
                            )}
                        </div>
                    ) : (
                        // --- 1B. जब यूज़र सर्च नहीं कर रहा है: बड़ा प्लेयर ---
                        <>
                            {loading && <div className="video-skeleton-loader"></div>}
                            {error && <div className="video-error-message">{error}</div>}
                            
                            {!selectedVideo && !loading && !error && (
                                <div className="video-error-message">Please select a video to play.</div>
                            )}

                            {selectedVideo && !loading && (
                                <>
                                    {/* --- वीडियो प्लेयर और वॉटरमार्क --- */}
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
                                        
                                        {/* ✅ YouTube रीडायरेक्ट रोकने वाला ब्लॉकर */}
                                        <div className="iframe-click-blocker"></div>

                                        <div className="video-watermark-logo">
                                            <img src="/rcm-ai-logo.png" alt="RCM AI" />
                                        </div>
                                    </div>

                                    {/* --- वीडियो डिटेल्स --- */}
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
                    <h3 className="sidebar-title">Motivational Leaders</h3>
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
                        
                        {/* ✅ साइडबार के लिए "Load More" बटन */}
                        {hasMore && !debouncedSearchTerm && (
                            <button className="load-more-btn" onClick={handleLoadMore} disabled={loadingMore}>
                                {loadingMore ? 'Loading...' : 'Load More'}
                            </button>
                        )}
                        
                        {!hasMore && !loading && (
                             <p className="sidebar-message">No more videos.</p>
                        )}
                    </div>
                </div>

            </div>

            {/* --- 3. मिनी-प्लेयर (पूरी स्क्रीन पर फिक्स्ड) --- */}
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