// src/components/VideoPage.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext'; // ✅ अब यह पाथ काम करना चाहिए

const VideoPlayer = ({ publicId, title }) => {
    // YouTube Embed URL Format
    const embedUrl = `https://www.youtube.com/embed/${publicId}?autoplay=0&controls=1&modestbranding=1&rel=0`;

    return (
        <div className="video-card bg-white shadow-lg rounded-lg overflow-hidden mb-8">
            <h4 className="text-xl font-semibold p-4 border-b">{title}</h4>
            <div className="relative" style={{ paddingBottom: '56.25%', height: 0 }}>
                <iframe
                    className="absolute top-0 left-0 w-full h-full"
                    src={embedUrl}
                    title={title}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                ></iframe>
            </div>
        </div>
    );
};

function VideoPage({ pageTitle, videoType }) {
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    // ✅ FIX: 'user' को हटा दिया गया क्योंकि वह इस्तेमाल नहीं हो रहा था (Eslint Warning Fix)
    // ✅ FIX: 'useAuth' अब काम करना चाहिए
    const { token, API_URL } = useAuth(); 

    useEffect(() => {
        const fetchVideos = async () => {
            if (!token) {
                setError('Authentication token is missing. Please log in.');
                setLoading(false);
                return;
            }

            try {
                // API_URL को AuthContext से लें
                const url = `${API_URL}/api/videos/${videoType}`; 
                
                const response = await axios.get(url, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (response.data.success && Array.isArray(response.data.data)) {
                    setVideos(response.data.data);
                } else {
                    setVideos([]);
                }
            } catch (err) {
                console.error(`Error fetching ${videoType} videos:`, err);
                setError('Failed to load videos. Please check your network or try again.');
            } finally {
                setLoading(false);
            }
        };

        // सुनिश्चित करें कि API_URL उपलब्ध है
        if(API_URL) {
            fetchVideos();
        }

    }, [videoType, token, API_URL]); 

    if (loading) {
        return <div className="p-8 text-center text-gray-600">Loading Videos...</div>;
    }

    if (error) {
        return <div className="p-8 text-center text-red-600">Error: {error}</div>;
    }

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">{pageTitle}</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {videos.length > 0 ? (
                    videos.map((video) => (
                        <VideoPlayer 
                            key={video.id}
                            publicId={video.publicId} 
                            title={video.title}
                        />
                    ))
                ) : (
                    <p className="text-gray-500">No videos available in this section.</p>
                )}
            </div>
        </div>
    );
}

export default VideoPage;