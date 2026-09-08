import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Search, PlayCircle, Tv, RefreshCw, Youtube } from 'lucide-react';
import ChannelsSidebar from './ChannelsSidebar';
import { VideoModal } from '../common/VideoModal';
import { extractYouTubeId } from '../../utils/textUtils';
import './ChannelVideos.css';

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
            onError={(e) => { e.target.src = 'https://placehold.co/320x180/e0e0e0/777?text=RCM'; }}
            loading="lazy"
            width="320"
            height="180"
            style={{ objectFit: 'cover', width: '100%', height: '100%' }}
          />
        ) : (
          <div className="thumbnail-placeholder"><PlayCircle size={40} /></div>
        )}
        <div className="play-overlay">
          <PlayCircle size={46} color="#ffffff" />
        </div>
      </div>
      <div className="grid-item-details">
        <h4 className="grid-item-title">{video.title}</h4>
        <p className="grid-item-date">
          {video.publishedAt ? new Date(video.publishedAt).toLocaleDateString() : ''}
        </p>
      </div>
    </div>
  );
});

function ChannelVideos() {
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const [activeVideo, setActiveVideo] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [contextLogoFailed, setContextLogoFailed] = useState(false);
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const { token, API_URL } = useAuth();

  const fetchChannelVideos = useCallback(async (channelId, pageNum, isInitial = false) => {
    if (!token || !API_URL || !channelId) return;

    if (isInitial) setLoading(true); else setLoadingMore(true);
    setError('');

    try {
      const res = await axios.get(`${API_URL}/api/channels/${channelId}/videos?page=${pageNum}&limit=12`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.data.success && Array.isArray(res.data.data)) {
        const newData = res.data.data;
        setVideos(prev => isInitial ? newData : [...prev, ...newData]);
        setHasMore(res.data.currentPage < res.data.totalPages);
      } else {
        if (isInitial) setVideos([]);
        setHasMore(false);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load channel videos.');
    } finally {
      if (isInitial) setLoading(false); else setLoadingMore(false);
    }
  }, [token, API_URL]);

  useEffect(() => {
    if (selectedChannel?.id) {
      setPage(1);
      setVideos([]);
      setHasMore(true);
      fetchChannelVideos(selectedChannel.id, 1, true);
    }
  }, [selectedChannel, fetchChannelVideos]);

  const handleSelectChannel = useCallback((channel) => {
    setSelectedChannel(prev => {
      if (prev?.id === channel.id) return prev;
      return channel;
    });
    setSearchTerm('');
    setContextLogoFailed(false);
  }, []);

  const filteredVideos = useMemo(() => {
    if (!debouncedSearchTerm) return videos;
    return videos.filter(v => v.title.toLowerCase().includes(debouncedSearchTerm.toLowerCase()));
  }, [videos, debouncedSearchTerm]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore && selectedChannel?.id) {
      const nextP = page + 1;
      setPage(nextP);
      fetchChannelVideos(selectedChannel.id, nextP, false);
    }
  }, [loadingMore, hasMore, selectedChannel, page, fetchChannelVideos]);

  return (
    <div className="channels-page-container">
      <div className="page-header">
        <div className={`yt-search ${searchOpen ? 'is-open' : ''}`}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setSearchOpen(false)}
            placeholder="Search videos"
            className="yt-search-input"
          />
          <span className="yt-search-btn">
            <Search size={18} />
          </span>
        </div>
      </div>

      <ChannelsSidebar selectedChannelId={selectedChannel?.id} onSelectChannel={handleSelectChannel} />

      <div className="channel-main-content">
        {selectedChannel && !loading && !error && filteredVideos.length > 0 && (
          <div className="channel-context-row">
            {selectedChannel.logoUrl && !contextLogoFailed ? (
              <img
                src={selectedChannel.logoUrl}
                alt=""
                className="channel-context-avatar"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setContextLogoFailed(true)}
              />
            ) : (
              <span className="channel-context-avatar channel-context-avatar-fallback">
                <Youtube size={16} />
              </span>
            )}
            <span className="channel-context-name">{selectedChannel.name}</span>
          </div>
        )}

        {loading ? (
          <div className="videos-loading">
            <RefreshCw className="spin-icon" size={32} />
            <p>Loading videos...</p>
          </div>
        ) : error ? (
          <div className="videos-error">
            <p>{error}</p>
          </div>
        ) : filteredVideos.length === 0 ? (
          <div className="videos-empty">
            <Tv size={48} />
            <h3>Videos syncing — check back shortly</h3>
            <p>This channel's videos are being automatically fetched or have not uploaded any matching videos yet.</p>
          </div>
        ) : (
          <>
            <div className="videos-grid">
              {filteredVideos.map((video) => (
                <VideoCardItem
                  key={video.id}
                  video={{
                    ...video,
                    videoUrl: `https://www.youtube.com/watch?v=${video.youtubeVideoId}`
                  }}
                  onVideoSelect={setActiveVideo}
                />
              ))}
            </div>

            {hasMore && !debouncedSearchTerm && (
              <div className="load-more-container">
                <button onClick={handleLoadMore} disabled={loadingMore} className="load-more-btn">
                  {loadingMore ? 'Loading...' : 'Load More Videos'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {activeVideo && (
        <VideoModal video={activeVideo} onClose={() => setActiveVideo(null)} />
      )}
    </div>
  );
}

export default ChannelVideos;