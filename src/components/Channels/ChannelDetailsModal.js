import React from 'react';
import './ChannelDetailsModal.css'; // Will create this CSS file
import { X, Youtube, Globe, Calendar, Users, Film, Eye } from 'lucide-react';
import { formatCount, formatDate } from '../../utils/formatUtils';

export function ChannelDetailsModal({ channel, onClose }) {
  if (!channel) return null;

  const description = channel.description || channel.channel_description || 'No description available.';
  const ytId = channel.channelId || channel.youtubeChannelId || channel.youtube_channel_id || channel.id;
  const ytHandle = channel.handle;
  const ytUrl = `https://www.youtube.com/${channel.handle ? (channel.handle.startsWith('@') ? channel.handle : '@' + channel.handle) : 'channel/' + ytId}`;

  const subscribers = channel.subscriberCount ?? channel.subscriber_count ?? 0;
  const videoCount = channel.videoCount ?? channel.video_count ?? 0;
  const viewCount = channel.viewCount ?? channel.view_count ?? 0;
  const joinedDate = channel.joinedDate || channel.joined_date;

  return (
    <div className="channel-details-modal-overlay" onClick={onClose}>
      <div className="channel-details-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>
          <X size={24} />
        </button>
        <h2 className="modal-title">About {channel.name}</h2>

        <div className="modal-section">
          <h3>Description</h3>
          <p>{description}</p>
        </div>

        <div className="modal-section">
          <h3>Details</h3>
          <p><Youtube size={16} /> <a href={ytUrl} target="_blank" rel="noopener noreferrer">{ytUrl.replace('https://', '')}</a></p>
          {(() => {
            const h = channel.handle;
            const formattedHandle = h ? (h.startsWith('@') ? h : `@${h}`) : '';
            return formattedHandle ? <p><Youtube size={16} /> Handle: {formattedHandle}</p> : null;
          })()}
          {channel.country && <p><Globe size={16} /> Country: {channel.country}</p>}
          {joinedDate && <p><Calendar size={16} /> Joined: {formatDate(joinedDate)}</p>}
        </div>

        <div className="modal-section">
          <h3>Statistics</h3>
          <p><Users size={16} /> {formatCount(subscribers)} subscribers</p>
          <p><Film size={16} /> {formatCount(videoCount)} videos</p>
          <p><Eye size={16} /> {formatCount(viewCount)} views</p>
        </div>
      </div>
    </div>
  );
}
