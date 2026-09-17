import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Search, PlayCircle, Tv, RefreshCw, Youtube, Info } from 'lucide-react';
import ChannelsSidebar from './ChannelsSidebar';
import { VideoModal } from '../common/VideoModal';
import { ChannelDetailsModal } from './ChannelDetailsModal'; // Will create this
import { extractYouTubeId } from '../../utils/textUtils';
import { formatCount, formatDate } from '../../utils/formatUtils';
import './ChannelVideos.css';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
    return () => { clearTimeout(handler); };
  }, [value, delay]);
  return debouncedValue;
}

const LiveBadge = () => (
  <span className="video-card-live-badge">
    <span className="badge-dot" style={{ width: '8px', height: '8px', backgroundColor: '#ff0000', borderRadius: '50%', display: 'inline-block', marginRight: '4px', animation: 'pulse 1.5s infinite' }}></span> LIVE
  </span>
);

const UpcomingBadge = ({ scheduledStartTime, fallbackTime }) => {
  const timeToUse = scheduledStartTime || fallbackTime;
  const formatTime = (isoDate) => {
    if (!isoDate) return "";
    const date = new Date(isoDate);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  };
  const formatDateDisplay = (isoDate) => {
    if (!isoDate) return "";
    const date = new Date(isoDate);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow";
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const formattedDate = formatDateDisplay(timeToUse);
  const formattedTime = formatTime(timeToUse);

  return (
    <span className="video-card-upcoming-badge">
      🕒 UPCOMING {formattedDate && formattedTime ? `| ${formattedDate} at ${formattedTime}` : ''}
    </span>
  );
};

const VideoCardItem = React.memo(({ video, onVideoSelect, isPinned }) => {
  const youtubeId = extractYouTubeId(video.videoUrl);
  const thumbnailUrl = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : video.thumbnailUrl;

  const isUpcoming = video.liveBroadcastContent === 'upcoming';
  const isLive = video.liveBroadcastContent === 'live';

  const handleClick = useCallback(() => {
    if (isLive) {
      onVideoSelect({ ...video, videoUrl: `https://www.youtube.com/watch?v=${video.liveVideoId}` });
    } else if (isUpcoming) {
      onVideoSelect({ ...video, videoUrl: `https://www.youtube.com/watch?v=${video.upcomingVideoId}` });
    } else {
      onVideoSelect(video);
    }
  }, [video, onVideoSelect, isLive, isUpcoming]);

  return (
    <div className={`video-grid-item ${isPinned ? 'video-grid-item-pinned' : ''}`} onClick={handleClick}>
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
        {isLive && <LiveBadge />}
        {isUpcoming && <UpcomingBadge scheduledStartTime={video.scheduledStartTime} fallbackTime={video.lastKnownLiveStartTime} />}
        <div className="play-overlay">
          <PlayCircle size={46} color="#ffffff" />
        </div>
      </div>
      <div className="grid-item-details">
        <h4 className="grid-item-title">{video.title}</h4>
        <p className="grid-item-date">
          {video.publishedAt ? new Date(video.publishedAt).toLocaleDateString() : ''}
        </p>
        {(isUpcoming || isLive) && video.liveViewerCount !== undefined && (
          <p className="grid-item-extra-info">
            {isLive && `Viewers: ${video.liveViewerCount}`}
            {isUpcoming && video.scheduledStartTime && `Starts: ${new Date(video.scheduledStartTime).toLocaleString()}`}
          </p>
        )}
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
  const [liveVideoData, setLiveVideoData] = useState(null);
  const [upcomingVideoData, setUpcomingVideoData] = useState(null);
  const isFetchingRef = useRef(false);
  const [showChannelDetailsModal, setShowChannelDetailsModal] = useState(false);

  const [activeVideo, setActiveVideo] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [contextLogoFailed, setContextLogoFailed] = useState(false);
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const { accessToken, API_URL } = useAuth();

  const fetchChannelVideos = useCallback(async (channelId, pageNum, isInitial = false) => {
    if (!accessToken || !API_URL || !channelId) return;
    if (isFetchingRef.current) return; 

    isFetchingRef.current = true;
    if (isInitial) setLoading(true); else setLoadingMore(true);
    setError('');

    try {
      console.log(`Fetching videos for channel ${channelId}, page ${pageNum}. Initial: ${isInitial}`);
      const res = await axios.get(`${API_URL}/api/channels/${channelId}/videos?page=${pageNum}&limit=12`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.data.success && Array.isArray(res.data.data)) {
        // Separate live/upcoming from regular videos
        let regularVideos = res.data.data;

        // Live and Upcoming videos will now be directly in regularVideos with their correct titles/scheduled times
        // Filter out any video that has liveBroadcastContent as 'live' or 'upcoming' and sort them to the top.
        const liveAndUpcomingVideos = regularVideos.filter(v => v.liveBroadcastContent === 'live' || v.liveBroadcastContent === 'upcoming');
        regularVideos = regularVideos.filter(v => v.liveBroadcastContent !== 'live' && v.liveBroadcastContent !== 'upcoming');
        
        const currentLive = liveAndUpcomingVideos.find(v => v.liveBroadcastContent === 'live');
        const currentUpcoming = liveAndUpcomingVideos.find(v => v.liveBroadcastContent === 'upcoming');
        
        setLiveVideoData(currentLive);
        setUpcomingVideoData(currentUpcoming);

        const newData = regularVideos;
        setVideos(prev => isInitial ? newData : [...prev, ...newData]);
        setHasMore(res.data.currentPage < res.data.totalPages);
      } else {
        if (isInitial) setVideos([]);
        setHasMore(false);
        setLiveVideoData(null);
        setUpcomingVideoData(null);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load channel videos.');
    } finally {
      isFetchingRef.current = false; 
      if (isInitial) setLoading(false); else setLoadingMore(false);
    }
  }, [accessToken, API_URL]);

  const pollLiveStatus = useCallback(async (channelId) => {
    if (!channelId) return;
    try {
      const res = await axios.get(`${API_URL}/api/channels/${channelId}/videos?page=1&limit=1`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.data.success && res.data.channel) {
        const fetchedChannel = res.data.channel;
        let currentLive = null;
        let currentUpcoming = null;

        if (fetchedChannel.isCurrentlyLive && fetchedChannel.liveVideoId) {
          currentLive = {
            id: fetchedChannel.liveVideoId,
            youtubeVideoId: fetchedChannel.liveVideoId,
            title: `LIVE: ${fetchedChannel.name} - ${fetchedChannel.liveVideoId}`,
            videoUrl: `https://www.youtube.com/watch?v=${fetchedChannel.liveVideoId}`,
            thumbnailUrl: `https://img.youtube.com/vi/${fetchedChannel.liveVideoId}/hqdefault.jpg`,
            publishedAt: fetchedChannel.liveStartedAt,
            isAvailable: true,
            liveBroadcastContent: 'live',
          };
        } else if (fetchedChannel.upcomingVideoId && fetchedChannel.scheduledStartTime) {
          currentUpcoming = {
            id: fetchedChannel.upcomingVideoId,
            youtubeVideoId: fetchedChannel.upcomingVideoId,
            title: `UPCOMING: ${fetchedChannel.name} - ${fetchedChannel.upcomingVideoId}`,
            videoUrl: `https://www.youtube.com/watch?v=${fetchedChannel.upcomingVideoId}`,
            thumbnailUrl: `https://img.youtube.com/vi/${fetchedChannel.upcomingVideoId}/hqdefault.jpg`,
            publishedAt: fetchedChannel.discoveredAt,
            isAvailable: true,
            liveBroadcastContent: 'upcoming',
            scheduledStartTime: fetchedChannel.scheduledStartTime,
          };
        }

        let liveChanged = false;
        let upcomingChanged = false;

        setLiveVideoData(prev => {
          liveChanged = prev?.id !== currentLive?.id;
          return currentLive;
        });

        setUpcomingVideoData(prev => {
          upcomingChanged = prev?.id !== currentUpcoming?.id;
          return currentUpcoming;
        });

        if (liveChanged || upcomingChanged) {
          fetchChannelVideos(channelId, 1, true);
        }
      }
    } catch (err) {
      console.error(`Error polling live status for channel ${channelId}: ${err.message}`);
    }
  }, [accessToken, API_URL, fetchChannelVideos]);

  useEffect(() => {
    if (!selectedChannel?.id) return;

    console.log('Selected channel details:', selectedChannel);

    setPage(1);
    setVideos([]);
    setHasMore(true);
    fetchChannelVideos(selectedChannel.id, 1, true);

    const pollInterval = setInterval(() => pollLiveStatus(selectedChannel.id), 60 * 1000);
    return () => clearInterval(pollInterval);
  }, [selectedChannel?.id, fetchChannelVideos, pollLiveStatus]);

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

  const videosToDisplay = useMemo(() => {
    let display = [...filteredVideos];
    if (liveVideoData) {
      display = display.filter(v => v.youtubeVideoId !== liveVideoData.youtubeVideoId);
      display.unshift(liveVideoData);
    } else if (upcomingVideoData) {
      display = display.filter(v => v.youtubeVideoId !== upcomingVideoData.youtubeVideoId);
      display.unshift(upcomingVideoData);
    }
    return display;
  }, [filteredVideos, liveVideoData, upcomingVideoData]);

  console.log("Current selectedChannel object:", selectedChannel);

  const subscribers = Number(selectedChannel?.subscriberCount ?? selectedChannel?.subscriber_count ?? 0);
  const videosCount = Number(selectedChannel?.videoCount ?? selectedChannel?.video_count ?? 0);
  const views = Number(selectedChannel?.viewCount ?? selectedChannel?.view_count ?? 0);
  const description = selectedChannel?.description?.trim() || "";

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
        {selectedChannel && !loading && !error && (
          <div className="channel-header">
            {selectedChannel.bannerUrl ? (
              <img src={selectedChannel.bannerUrl} alt="Channel Banner" className="channel-banner" />
            ) : (
              <div className="channel-banner" style={{ background: 'linear-gradient(135deg, #004a99 0%, #002244 100%)' }} />
            )}
            <div className="channel-header-details">
              <div className="channel-header-avatar-wrap">
                {selectedChannel.logoUrl && !contextLogoFailed ? (
                  <img
                    src={selectedChannel.logoUrl}
                    alt="Channel Logo"
                    className="channel-header-avatar"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => setContextLogoFailed(true)}
                  />
                ) : (
                  <span className="channel-header-avatar channel-header-avatar-fallback">
                    <Youtube size={32} />
                  </span>
                )}
              </div>
              <div className="channel-header-info">
                <h2 className="channel-header-name">{selectedChannel.name}</h2>
                <p className="channel-header-meta">
                  {(() => {
                    const h = selectedChannel.handle;
                    const formattedHandle = h ? (h.startsWith('@') ? h : `@${h}`) : '';
                    return formattedHandle ? (
                      <>
                        <span className="channel-handle">{formattedHandle}</span>
                        <span className="separator">•</span>
                      </>
                    ) : null;
                  })()}
                  <span className="channel-sub-count">{formatCount(subscribers)} subscribers</span>
                  <span className="separator">•</span>
                  <span className="channel-video-count">{formatCount(videosCount)} videos</span>
                  <span className="separator">•</span>
                  <span className="channel-view-count">{formatCount(views)} views</span>
                </p>
                <div className="channel-description-container">
                  <p className="channel-description-excerpt">
                    {description ? (
                      description.length > 100 ? `${description.substring(0, 100)}...` : description
                    ) : (
                      'Official RCM channel for training, updates, and leadership videos.'
                    )}
                  </p>
                  <button className="more-info-btn" onClick={() => setShowChannelDetailsModal(true)}>
                    More info <Info size={14} />
                  </button>
                </div>
              </div>
            </div>
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
        ) : (liveVideoData || upcomingVideoData || videosToDisplay.length > 0) ? (
          <>
            {(liveVideoData || upcomingVideoData) && (
              <div className="pinned-video-grid">
                {liveVideoData && (
                  <VideoCardItem
                    key={liveVideoData.id}
                    video={{
                      ...liveVideoData,
                      videoUrl: `https://www.youtube.com/watch?v=${liveVideoData.youtubeVideoId}`
                    }}
                    onVideoSelect={setActiveVideo}
                    isPinned={true}
                  />
                )}
                {!liveVideoData && upcomingVideoData && (
                  <VideoCardItem
                    key={upcomingVideoData.id}
                    video={{
                      ...upcomingVideoData,
                      videoUrl: `https://www.youtube.com/watch?v=${upcomingVideoData.youtubeVideoId}`
                    }}
                    onVideoSelect={setActiveVideo}
                    isPinned={true}
                  />
                )}
              </div>
            )}

            <div className={liveVideoData || upcomingVideoData ? "normal-video-grid" : "videos-grid"}>
              {videosToDisplay.map((video) => (
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
        ) : (
          <div className="videos-empty">
            <Tv size={48} />
            <h3>Videos syncing — check back shortly</h3>
            <p>This channel's videos are being automatically fetched or have not uploaded any matching videos yet.</p>
          </div>
        )}
      </div>

      {activeVideo && (
        <VideoModal video={activeVideo} onClose={() => setActiveVideo(null)} />
      )}

      {selectedChannel && showChannelDetailsModal && (
        <ChannelDetailsModal
          channel={selectedChannel}
          onClose={() => setShowChannelDetailsModal(false)}
        />
      )}
    </div>
  );
}

export default ChannelVideos;
