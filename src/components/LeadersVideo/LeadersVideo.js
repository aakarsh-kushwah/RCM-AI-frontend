import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import './LeadersVideo.css'; 
import { Search, PlayCircle, ArrowLeft } from 'lucide-react';
import { VideoModal } from '../common/VideoModal';
import { extractYouTubeId } from '../../utils/textUtils';

function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
        return () => { clearTimeout(handler); };
    }, [value, delay]);
    return debouncedValue;
}

const VideoCardItem = React.memo(({ video, onVideoSelect }) => {
    const youtubeId = extractYouTubeId(video.videoUrl);
    const thumbnailUrl = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : video.thumbnailUrl;

    return (
        <div className="video-grid-item" onClick={() => onVideoSelect(video)}>
            <div className="grid-item-thumbnail">
                {thumbnailUrl ? (
                    <img 
                      src={thumbnailUrl} 
                      alt={video.title} 
                      onError={(e) => e.target.src = 'https://placehold.co/320x180/e0e0e0/777?text=RCM'} 
                      loading="lazy"
                      width="320"
                      height="180"
                      style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                    />
                ) : (
                    <div className="thumbnail-placeholder"><PlayCircle size={40} /></div>
                )}
                <div className="play-overlay">
                    <PlayCircle size={48} color="#ffffff" />
                </div>
            </div>
            <div className="grid-item-details">
                <h4 className="grid-item-title">{video.title}</h4>
                <p className="grid-item-subtitle">{video.leaderName || "Leader's Video"}</p>
            </div>
        </div>
    );
});

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

    const { token, API_URL } = useAuth(); 
    const location = useLocation();
    const navigate = useNavigate();

    const fetchVideos = useCallback(async (pageNum, isInitialLoad = false) => {
        const authToken = token || localStorage.getItem('token') || localStorage.getItem('accessToken');
        if (!authToken || !API_URL) {
             setError("Authentication error. Please log in again.");
             setLoading(false);
             return;
        }
        
        if (isInitialLoad) setLoading(true); else setLoadingMore(true);
        setError('');
        
        const limit = 20;
        let url = `${API_URL}/api/videos/leaders?page=${pageNum}&limit=${limit}`;

        try {
            const response = await axios.get(url, { headers: { Authorization: `Bearer ${authToken}` } });
            
            if (response.data.success && Array.isArray(response.data.data)) {
                const newData = response.data.data;
                setAllVideos(prev => isInitialLoad ? newData : [...prev, ...newData]);
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
    }, [token, API_URL]);

    useEffect(() => {
        if (token && API_URL) {
            setPage(1); 
            setAllVideos([]);
            setHasMore(true);
            
            if (location.state && location.state.selectedVideo) {
                 setActiveVideo(location.state.selectedVideo);
                 navigate(location.pathname, { replace: true, state: {} });
            }
            
            fetchVideos(1, true);
        }
    }, [token, API_URL, location.state, navigate, fetchVideos]); 

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

    const handleVideoSelect = useCallback((video) => {
        setActiveVideo(video);
    }, []);

    const handleCloseModal = useCallback(() => {
        setActiveVideo(null);
    }, []);

    const handleLoadMore = useCallback(() => {
        if (!loadingMore && hasMore) {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchVideos(nextPage, false);
        }
    }, [page, loadingMore, hasMore, fetchVideos]);

    return (
        <div className="leaders-video-page"> 
            <div className="page-header">
                <button onClick={() => navigate('/dashboard')} className="back-to-dashboard">
                    <ArrowLeft size={20} /> Back
                </button>
                <h1 className="page-main-title">{pageTitle || "Leaders' Videos"}</h1>
                
                <div className="search-bar-container">
                    <span className="search-icon"><Search size={20} /></span>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={handleSearchChange}
                        placeholder="Search Leader Videos..."
                        className="search-input"
                    />
                </div>
            </div>

            <div className="main-content-layout" style={{ display: 'block', padding: '20px' }}>
                {loading && allVideos.length === 0 && <div className="video-skeleton-loader">Loading videos...</div>}
                {error && <div className="video-error-message">{error}</div>}

                <div className="results-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                    {filteredVideos.map((video) => (
                        <VideoCardItem
                            key={video.id || video.publicId}
                            video={video}
                            onVideoSelect={handleVideoSelect}
                        />
                    ))}
                </div>

                {!loading && filteredVideos.length === 0 && !error && (
                    <p className="sidebar-message" style={{ textAlign: 'center', padding: '40px' }}>No leader videos found.</p>
                )}

                {hasMore && !debouncedSearchTerm && (
                    <div style={{ textAlign: 'center', marginTop: '30px' }}>
                        <button className="load-more-btn" onClick={handleLoadMore} disabled={loadingMore}>
                            {loadingMore ? 'Loading...' : 'Load More Videos'}
                        </button>
                    </div>
                )}
            </div>

            <VideoModal video={activeVideo} onClose={handleCloseModal} />
        </div>
    );
}

export default LeadersVideo;
