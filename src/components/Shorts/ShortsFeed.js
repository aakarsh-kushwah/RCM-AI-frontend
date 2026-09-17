import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';
import { Heart, MessageCircle } from 'lucide-react';
import './ShortsFeed.css';

const ShortsFeed = () => {
  const [shorts, setShorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  const fetchShorts = useCallback(async () => {
    if (!hasMore) return;
    setLoading(true);
    try {
      const baseUrl = process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const cleanBase = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
      const res = await axios.get(`${cleanBase}/shorts?page=${page}&limit=10`, {
        withCredentials: true,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      const newShorts = res.data?.data || res.data?.shorts || [];
      setShorts((prev) => (page === 1 ? newShorts : [...prev, ...newShorts]));
      setHasMore(res.data?.currentPage < res.data?.totalPages);
    } catch (error) {
      console.error('Error fetching shorts:', error);
    } finally {
      setLoading(false);
    }
  }, [page, hasMore]);

  useEffect(() => {
    fetchShorts();
  }, [fetchShorts]);

  const handleLike = async (videoId) => {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      const baseUrl = process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const cleanBase = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
      const response = await axios.post(`${cleanBase}/shorts/${videoId}/like`, {},
        {
          withCredentials: true,
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`
          }
        }
      );
      setShorts(prevShorts =>
        prevShorts.map(short =>
          short.id === videoId ? { ...short, isLiked: response.data.isLiked, likesCount: response.data.likesCount } : short
        )
      );
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const handleScroll = useCallback(() => {
    if (
      window.innerHeight + document.documentElement.scrollTop >=
      document.documentElement.offsetHeight - 100 && // 100px from bottom
      !loading &&
      hasMore
    ) {
      setPage(prevPage => prevPage + 1);
    }
  }, [loading, hasMore]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  if (loading && shorts.length === 0) {
    return <LoadingSpinner message="Loading Shorts..." />;
  }

  return (
    <div className="shorts-feed">
      {shorts.map(short => (
        <div key={short.id} className="short-card">
          <div className="video-container">
            <iframe
              src={`https://www.youtube.com/embed/${short.youtubeVideoId}?autoplay=0&controls=1&modestbranding=1`}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={short.title}
            ></iframe>
          </div>
          <div className="short-info">
            <h3>{short.title}</h3>
            <p className="channel-name">By {short.channel.name}</p>
            <div className="short-actions">
              <button onClick={() => handleLike(short.id)} className={`like-button ${short.isLiked ? 'liked' : ''}`}>
                <Heart size={20} /> {short.likesCount}
              </button>
              <button onClick={() => navigate(`/shorts/${short.id}/comments`)} className="comment-button">
                <MessageCircle size={20} /> {short.commentsCount}
              </button>
            </div>
          </div>
        </div>
      ))}
      {loading && hasMore && <LoadingSpinner message="Loading more Shorts..." />}
      {!hasMore && shorts.length > 0 && <p className="end-message">You've reached the end of Shorts.</p>}
      {!loading && shorts.length === 0 && <p className="no-shorts-message">No shorts available at the moment.</p>}
    </div>
  );
};

export default ShortsFeed;
