import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Youtube, Tv, ChevronLeft, ChevronRight } from 'lucide-react';
import './ChannelVideos.css';

const AUTO_SCROLL_SPEED = 20; // pixels per second

function ChannelsSidebar({ selectedChannelId, onSelectChannel }) {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [failedLogos, setFailedLogos] = useState(() => new Set());

  const scrollerRef = useRef(null);
  const isPausedRef = useRef(false);
  const resumeTimeoutRef = useRef(null);
  const { token, API_URL } = useAuth();

  useEffect(() => {
    async function fetchChannels() {
      if (!token || !API_URL) return;
      try {
        setLoading(true);
        const res = await axios.get(`${API_URL}/api/channels`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.data.success && Array.isArray(res.data.data)) {
          const chList = res.data.data;
          setChannels(chList);
          if (!selectedChannelId && chList.length > 0) {
            onSelectChannel(chList[0]);
          }
        }
      } catch (err) {
        setError('Failed to load channels');
      } finally {
        setLoading(false);
      }
    }
    fetchChannels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, API_URL]);

  const markLogoFailed = useCallback((channelId) => {
    setFailedLogos(prev => {
      if (prev.has(channelId)) return prev;
      const next = new Set(prev);
      next.add(channelId);
      return next;
    });
  }, []);

  const updateScrollButtons = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollWidth > el.clientWidth + 4);
  }, []);

  useEffect(() => {
    updateScrollButtons();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollButtons, { passive: true });
    window.addEventListener('resize', updateScrollButtons);
    return () => {
      el.removeEventListener('scroll', updateScrollButtons);
      window.removeEventListener('resize', updateScrollButtons);
    };
  }, [channels, updateScrollButtons]);

  // Continuous auto-slide — loops seamlessly through a duplicated list,
  // pauses whenever the user is interacting with the strip.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || channels.length === 0) return;

    let rafId;
    let lastTime = null;

    const step = (now) => {
      if (lastTime === null) lastTime = now;
      const deltaSeconds = (now - lastTime) / 1000;
      lastTime = now;

      const half = el.scrollWidth / 2;
      if (!isPausedRef.current && half > el.clientWidth) {
        el.scrollLeft += AUTO_SCROLL_SPEED * deltaSeconds;
        if (el.scrollLeft >= half) {
          el.scrollLeft -= half;
        }
      }
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [channels]);

  const pauseAutoScroll = useCallback(() => {
    isPausedRef.current = true;
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
  }, []);

  const resumeAutoScrollSoon = useCallback(() => {
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = setTimeout(() => {
      isPausedRef.current = false;
    }, 1200);
  }, []);

  useEffect(() => () => {
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
  }, []);

  const scrollByAmount = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    pauseAutoScroll();
    el.scrollBy({ left: dir * 260, behavior: 'smooth' });
    resumeAutoScrollSoon();
  };

  if (loading) {
    return (
      <div className="channels-strip">
        <div className="channel-scroller">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="channel-chip channel-chip-skeleton">
              <div className="channel-chip-avatar-wrap skeleton-circle" />
              <div className="skeleton-line" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="channels-strip channels-strip-error">{error}</div>;
  }

  if (channels.length === 0) {
    return (
      <div className="channels-strip channels-strip-empty">
        <Tv size={22} />
        <p>No active channels found.</p>
      </div>
    );
  }

  // Duplicated so the auto-slide can loop seamlessly once content overflows.
  const displayChannels = [...channels, ...channels];

  const renderChip = (ch, copyIndex) => {
    const isSelected = ch.id === selectedChannelId;
    return (
      <button
        key={`${ch.id}-${copyIndex}`}
        type="button"
        className={`channel-chip ${isSelected ? 'is-active' : ''}`}
        onClick={() => onSelectChannel(ch)}
      >
        <span className="channel-chip-avatar-wrap">
          {ch.logoUrl && !failedLogos.has(ch.id) ? (
            <img
              src={ch.logoUrl}
              alt=""
              className="channel-chip-avatar"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => markLogoFailed(ch.id)}
            />
          ) : (
            <span className="channel-chip-avatar channel-chip-avatar-fallback">
              <Youtube size={24} />
            </span>
          )}
        </span>
        <span className="channel-chip-name" title={ch.name}>{ch.name}</span>
      </button>
    );
  };

  return (
    <div
      className="channels-strip"
      onMouseEnter={pauseAutoScroll}
      onMouseLeave={() => { isPausedRef.current = false; }}
      onTouchStart={pauseAutoScroll}
      onTouchEnd={resumeAutoScrollSoon}
    >
      {canScrollLeft && (
        <button
          type="button"
          className="channel-scroll-btn channel-scroll-btn-left"
          onClick={() => scrollByAmount(-1)}
          aria-label="Scroll channels left"
        >
          <ChevronLeft size={20} />
        </button>
      )}

      <div className="channel-scroller" ref={scrollerRef}>
        {displayChannels.map((ch, idx) => renderChip(ch, idx < channels.length ? 'a' : 'b'))}
      </div>

      {canScrollRight && (
        <button
          type="button"
          className="channel-scroll-btn channel-scroll-btn-right"
          onClick={() => scrollByAmount(1)}
          aria-label="Scroll channels right"
        >
          <ChevronRight size={20} />
        </button>
      )}
    </div>
  );
}

export default ChannelsSidebar;