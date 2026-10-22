import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Zap, Star, TrendingUp, LogOut, ChevronRight, ExternalLink, ArrowUpRight, Sparkles, Bell, X, Film, BellOff, Download
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import usePushNotification from '../../hooks/usePushNotification';
import useInstallPrompt from '../../hooks/useInstallPrompt';
import InstallAppBanner from '../InstallAppBanner';
import './UserDashboard.css';

// Team Dekho — the in-house WebRTC meeting platform (~90% cheaper than Zoom,
// built specifically for direct-selling teams). Configurable per environment
// so this never silently points at the wrong domain in production.
const TEAM_DEKHO_URL = process.env.REACT_APP_TEAM_DEKHO_URL || 'https://teamdekho.com';

// Logo from public folder (e.g., /rcm_logo.png or /rcm_logo.jpg)
const RCM_LOGO_URL = '/rcm_logo.png';

// Team Dekho's logo — place teamdekhologo.png in /public so this path resolves.
const TEAM_DEKHO_LOGO = '/teamdekhologo.png';

const NAV_ITEMS = [{ path: '/chat', label: 'Assistant', icon: Zap }];

const UserDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { supported, permission, enabled, loading, enable, disable } = usePushNotification();
  const { deferredPrompt, isAppInstalled, promptInstall } = useInstallPrompt();

  const [scrolled, setScrolled] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [showPwaBanner, setShowPwaBanner] = useState(true); // Control visibility of the install banner

  const profileRef = useRef(null);
  const notifRef = useRef(null);

  const firstName = useMemo(() => {
    const name = user?.fullName || 'Partner';
    return name.split(' ')[0];
  }, [user]);

  const initial = firstName.charAt(0).toUpperCase();
  const role = user?.role === 'ADMIN' ? 'Admin' : (user?.status === 'premium' ? 'Premium Partner' : 'Partner');

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
        setConfirmingLogout(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const performLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const handleVideoCall = () => {
    window.open(TEAM_DEKHO_URL, '_blank', 'noopener,noreferrer');
  };

  const isItemActive = (item) => location.pathname === item.path;

  const handleNotificationToggle = async () => {
    if (loading) return;
    if (permission === 'denied') return;
    if (enabled) {
      await disable();
    } else {
      await enable();
    }
  };

  const renderBellIcon = () => {
    if (loading) {
      return (
        <div className="rcmud-notification-bell rcmud-notification-bell--loading">
          <Bell size={19} strokeWidth={1.8} />
          <span className="rcmud-loading-spinner" />
        </div>
      );
    } else if (permission === 'denied') {
      return (
        <div className="rcmud-notification-bell rcmud-notification-bell--blocked" title="Notifications are blocked in your browser settings">
          <BellOff size={19} strokeWidth={1.8} />
        </div>
      );
    } else if (enabled) {
      return (
        <div className="rcmud-notification-bell rcmud-notification-bell--on">
          <Bell size={19} strokeWidth={1.8} />
          <i className="rcmud-dot" />
        </div>
      );
    } else {
      return (
        <div className="rcmud-notification-bell rcmud-notification-bell--off">
          <Bell size={19} strokeWidth={1.8} />
        </div>
      );
    }
  };

  return (
    <div className="rcmud-shell">
      {/* ---------- SIDEBAR (desktop only) ---------- */}
      <aside className="rcmud-side">
        <div className="rcmud-brand">
          <img src={RCM_LOGO_URL} alt="TeamDekho" className="rcmud-brand-mark" />
          <span className="rcmud-brand-name">Team<span className="rcmud-accent">Dekho</span></span>
        </div>

        <div className="rcmud-identity">
          <span className="rcmud-avatar">{initial}</span>
          <span className="rcmud-identity-text">
            <span className="rcmud-identity-name">{firstName}</span>
            <span className="rcmud-identity-role">{role}</span>
          </span>
        </div>

        <nav className="rcmud-nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.label}
              className={`rcmud-nav-item ${isItemActive(item) ? 'is-active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <item.icon size={19} strokeWidth={1.8} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="rcmud-signout-zone">
          {!confirmingLogout ? (
            <button className="rcmud-signout" onClick={() => setConfirmingLogout(true)}>
              <LogOut size={17} strokeWidth={1.8} />
              <span>Sign out</span>
            </button>
          ) : (
            <div className="rcmud-signout-confirm">
              <span>Sign out of TeamDekho?</span>
              <div className="rcmud-signout-actions">
                <button className="rcmud-mini-btn" onClick={() => setConfirmingLogout(false)}>Cancel</button>
                <button className="rcmud-mini-btn is-danger" onClick={performLogout}>Yes, sign out</button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ---------- MAIN ---------- */}
      <main className="rcmud-main">
        <header className={`rcmud-topbar ${scrolled ? 'is-scrolled' : ''}`}>
          <div className="rcmud-topbar-brand">
            <img src={RCM_LOGO_URL} alt="TeamDekho" />
            <span>Team<span className="rcmud-accent">Dekho</span></span>
          </div>

          <div className="rcmud-topbar-right">
            {supported && (
              <button
                className="rcmud-icon-btn rcmud-bell-toggle"
                onClick={handleNotificationToggle}
                aria-label={enabled ? "Disable notifications" : "Enable notifications"}
                aria-pressed={enabled}
                disabled={permission === 'denied' || loading}
                title={permission === 'denied' ? "Notifications are blocked in your browser settings" : (enabled ? "Notifications ON" : "Notifications OFF")}
              >
                {renderBellIcon()}
              </button>
            )}

            <div className="rcmud-profile" ref={notifRef}>
              <button
                className="rcmud-icon-btn"
                aria-label="Notifications"
                onClick={() => setNotifOpen((v) => !v)}
              >
                <Bell size={19} strokeWidth={1.8} />
                <i className="rcmud-dot" />
              </button>

              {notifOpen && (
                <div className="rcmud-profile-sheet">
                  <div className="rcmud-profile-head">
                    <strong style={{ fontSize: '0.9rem' }}>Notifications</strong>
                    <button className="rcmud-sheet-close" onClick={() => setNotifOpen(false)} aria-label="Close">
                      <X size={16} />
                    </button>
                  </div>
                  <p className="rcmud-empty-note">You're all caught up — nothing new right now.</p>
                </div>
              )}
            </div>

            <div className="rcmud-profile" ref={profileRef}>
              <button
                className="rcmud-avatar-btn"
                onClick={() => setProfileOpen((v) => !v)}
                aria-label="Account menu"
              >
                {initial}
              </button>

              {profileOpen && (
                <div className="rcmud-profile-sheet">
                  <div className="rcmud-profile-head">
                    <span className="rcmud-avatar">{initial}</span>
                    <span>
                      <strong>{firstName}</strong>
                      <em>{role}</em>
                    </span>
                    <button className="rcmud-sheet-close" onClick={() => setProfileOpen(false)} aria-label="Close">
                      <X size={16} />
                    </button>
                  </div>

                  {!confirmingLogout ? (
                    <button className="rcmud-sheet-signout" onClick={() => setConfirmingLogout(true)}>
                      <LogOut size={17} strokeWidth={1.8} />
                      <span>Sign out</span>
                    </button>
                  ) : (
                    <div className="rcmud-signout-confirm">
                      <span>Sign out of TeamDekho?</span>
                      <div className="rcmud-signout-actions">
                        <button className="rcmud-mini-btn" onClick={() => setConfirmingLogout(false)}>Cancel</button>
                        <button className="rcmud-mini-btn is-danger" onClick={performLogout}>Yes, sign out</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="rcmud-content">
          {/* PWA Install Banner Popup on Dashboard */}
          {deferredPrompt && !isAppInstalled && showPwaBanner && (
            <InstallAppBanner onInstall={promptInstall} onDismiss={() => setShowPwaBanner(false)} />
          )}

          {/* ---------- The two headline entry points ---------- */}
          <section className="rcmud-feature-grid" aria-label="Quick access" style={{ marginTop: '1.5rem' }}>
            <button
              type="button"
              className="rcmud-feature-card is-ai"
              onClick={() => navigate('/chat')}
              aria-label="Open your AI assistant"
            >
              <span className="rcmud-ai-shine" aria-hidden="true" />
              <span className="rcmud-ai-icon">
                <Sparkles size={20} strokeWidth={1.8} />
              </span>
              <span className="rcmud-feature-copy">
                <span className="rcmud-feature-title">Your Assistant</span>
                <span className="rcmud-feature-sub">Ask about PV, products, training — anything</span>
              </span>
              <span className="rcmud-feature-go" aria-hidden="true">
                <ArrowUpRight size={18} />
              </span>
            </button>

            <button
              type="button"
              className="rcmud-feature-card is-team"
              onClick={handleVideoCall}
              aria-label="Open Team Dekho video call"
            >
              <span className="rcmud-feature-go is-corner" aria-hidden="true">
                <ExternalLink size={14} />
              </span>
              <img src={TEAM_DEKHO_LOGO} alt="Team Dekho" className="rcmud-team-logo" />
            </button>
          </section>

          <section className="rcmud-app-grid" aria-label="Core Modules">
            <button className="rcmud-app-card" onClick={() => navigate('/shorts')}>
              <div className="rcmud-app-header">
                <span className="rcmud-app-icon red-pink-gradient"><Film size={22} /></span>
              </div>
              <div className="rcmud-app-body">
                <span className="rcmud-app-title">RCM Shorts</span>
                <span className="rcmud-app-sub">60s Micro-Learning & Sales Hacks</span>
              </div>
              <div className="rcmud-app-footer">
                <span>Explore Feed</span>
                <ArrowUpRight size={16} />
              </div>
            </button>

            <button className="rcmud-app-card" onClick={() => navigate('/leaders-videos')}>
              <div className="rcmud-app-header">
                <span className="rcmud-app-icon teal"><Star size={22} /></span>
                <span className="rcmud-app-badge is-teal">Academy</span>
              </div>
              <div className="rcmud-app-body">
                <span className="rcmud-app-title">Leader Academy</span>
                <span className="rcmud-app-sub">Training from top direct-selling leaders</span>
              </div>
              <div className="rcmud-app-footer">
                <span>Watch Classes</span>
                <ArrowUpRight size={16} />
              </div>
            </button>

            <button className="rcmud-app-card" onClick={() => navigate('/products-videos')}>
              <div className="rcmud-app-header">
                <span className="rcmud-app-icon rose"><Star size={22} /></span>
                <span className="rcmud-app-badge is-rose">Catalog</span>
              </div>
              <div className="rcmud-app-body">
                <span className="rcmud-app-title">Product Catalog</span>
                <span className="rcmud-app-sub">Browse items with visual guides & demos</span>
              </div>
              <div className="rcmud-app-footer">
                <span>Browse Products</span>
                <ArrowUpRight size={16} />
              </div>
            </button>

            <button className="rcmud-app-card" onClick={() => navigate('/daily-report')}>
              <div className="rcmud-app-header">
                <span className="rcmud-app-icon amber"><TrendingUp size={22} /></span>
                <span className="rcmud-app-badge is-amber">Analytics</span>
              </div>
              <div className="rcmud-app-body">
                <span className="rcmud-app-title">Growth & PV</span>
                <span className="rcmud-app-sub">Full breakdown of this month's numbers</span>
              </div>
              <div className="rcmud-app-footer">
                <span>View Reports</span>
                <ArrowUpRight size={16} />
              </div>
            </button>

            <button className="rcmud-app-card is-wide" onClick={() => navigate('/channels-videos')}>
              <div className="rcmud-app-header">
                <span className="rcmud-app-icon indigo"><Sparkles size={22} /></span>
                <span className="rcmud-app-badge is-indigo">Synced Live</span>
              </div>
              <div className="rcmud-app-body">
                <span className="rcmud-app-title">Official Channels</span>
                <span className="rcmud-app-sub">Auto-synced YouTube feeds & live broadcasts</span>
              </div>
              <div className="rcmud-app-footer">
                <span>Open Channels</span>
                <ArrowUpRight size={16} />
              </div>
            </button>
          </section>

          <div className="rcmud-spacer" />
        </div>
      </main>
    </div>
  );
};

export default UserDashboard;