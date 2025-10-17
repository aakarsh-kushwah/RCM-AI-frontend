import React, { useState, useEffect } from 'react';
import './VideoPage.css';

// This is the reusable video page component for the user UI
function VideoPage({ pageTitle, videoType }) {
    const [videos, setVideos] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Helper function to get YouTube Embed URL
    const getEmbedUrl = (publicId) => {
        // publicId now holds the clean 11-character YouTube ID
        if (publicId && publicId.length === 11) {
            // Use YouTube's secure embed URL
            return `https://www.youtube.com/embed/${publicId}?autoplay=0&rel=0`;
        }
        // Fallback for non-YouTube links
        return null; 
    };

    useEffect(() => {
        const fetchVideos = async () => {
            setLoading(true);
            setError('');
            
            const token = localStorage.getItem('token');
            
            if (!token) {
                setError('Authentication required to view videos.');
                setLoading(false);
                return;
            }

            try {
                const response = await fetch(`${process.env.REACT_APP_API_URL}/api/videos/${videoType}?search=${search}`, {
                    headers: {
                        'Authorization': `Bearer ${token}` 
                    }
                });

                if (response.status === 401) {
                    throw new Error('Access denied. Token is invalid or expired.');
                }
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Failed to load videos.');
                }
                
                const result = await response.json();
                setVideos(result.data || []);
            } catch (err) {
                console.error(`Failed to fetch ${videoType} videos:`, err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        
        const timer = setTimeout(fetchVideos, 300);
        return () => clearTimeout(timer);
    }, [search, videoType]);

    return (
        <div className="video-page-container">
            <h2>{pageTitle}</h2>
            <input 
                type="text" 
                className="search-bar"
                placeholder="Search videos by title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
            />
            {loading && <p className="status-text">Loading videos...</p>}
            {error && <p className="error-message">Error: {error}</p>}
            {!loading && !error && (
                <div className="video-grid">
                    {videos.length > 0 ? videos.map(video => (
                        <div key={video.id} className="video-card">
                            {/* YouTube Embed: iframe for best streaming quality */}
                            <iframe
                                width="100%"
                                height="200"
                                src={getEmbedUrl(video.publicId)}
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                                title={video.title}
                                className="youtube-embed"
                            ></iframe>

                            <div className="video-info">
                                <h4>{video.title}</h4>
                                <p>{video.description}</p>
                            </div>
                        </div>
                    )) : <p className="status-text">No videos found matching your search.</p>}
                </div>
            )}
        </div>
    );
}

export default VideoPage;
