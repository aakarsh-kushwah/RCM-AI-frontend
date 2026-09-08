import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { extractYouTubeId } from '../../utils/textUtils';
import './VideoModal.css';

export const VideoModal = ({ video, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!video) return null;

  const videoId = video.youtubeVideoId || extractYouTubeId(video.videoUrl || video.url) || video.publicId;

  return (
    <div className="video-modal-backdrop" onClick={onClose}>
      <div className="video-modal-container" onClick={(e) => e.stopPropagation()}>
        <button className="video-modal-close-btn" onClick={onClose} aria-label="Close modal">
          <X size={24} />
        </button>
        <div className="video-modal-player-wrapper">
          {videoId ? (
            <iframe
              className="video-modal-iframe"
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&modestbranding=1&rel=0`}
              title={video.title}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          ) : (
            <div className="video-modal-fallback">
              <p>Video URL is invalid or missing.</p>
            </div>
          )}
          <div className="video-modal-watermark">
            <img src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" alt="RCM AI" />
          </div>
        </div>
        <div className="video-modal-details">
          <h2 className="video-modal-title">{video.title}</h2>
          {video.category && <span className="video-modal-tag">{video.category}</span>}
          {video.leaderName && <span className="video-modal-tag">{video.leaderName}</span>}
          <p className="video-modal-desc">{video.description || 'No description provided.'}</p>
        </div>
      </div>
    </div>
  );
};
