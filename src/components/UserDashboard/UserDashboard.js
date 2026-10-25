import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Zap, Star, TrendingUp, LogOut, ExternalLink, ArrowUpRight, Sparkles,
  Bell, X, Film, BellOff, Download, Package, Youtube
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import usePushNotification from '../../hooks/usePushNotification';
import useInstallPrompt from '../../hooks/useInstallPrompt';
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

// Static data lives outside the component: it is never re-created on render.
const MODULES = [
  { path: '/shorts', title: 'RCM Shorts', sub: '60s Micro-Learning & Sales Hacks', cta: 'Explore Feed', icon: Film, tone: 'pink' },
  { path: '/leaders-videos', title: 'Leader Academy', sub: 'Training from top direct-selling leaders', cta: 'Watch Classes', icon: Star, tone: 'teal', badge: 'Academy' },
  { path: '/products-videos', title: 'Product Catalog', sub: 'Browse items with visual guides & demos', cta: 'Browse Products', icon: Package, tone: 'rose', badge: 'Catalog' },
  { path: '/daily-report', title: 'Growth & PV', sub: "Full breakdown of this month's numbers", cta: 'View Reports', icon: TrendingUp, tone: 'amber', badge: 'Analytics' },
  { path: '/channels-videos', title: 'Official Channels', sub: 'Auto-synced YouTube feeds & live broadcasts', cta: 'Open Channels', icon: Youtube, tone: 'indigo', badge: 'Synced Live', live: true, wide: true }
];

// Cursor spotlight only on devices that really have a mouse.
const CAN_HOVER =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

// Writes the pointer position to CSS variables (throttled to one write per frame).
// The glow itself moves with `transform`, so there is no layout work and no repaint.
const useSpotlight = () => {
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return useCallback((e) => {
    if (!CAN_HOVER || raf.current) return;
    const el = e.currentTarget;
    const { clientX, clientY } = e;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${clientX - r.left}px`);
      el.style.setProperty('--my', `${clientY - r.top}px`);
    });
  }, []);
};

/* ------------------------------ Memoized pieces ------------------------------ */

const ModuleCard = memo(({ item, index, onOpen }) => {
  const Icon = item.icon;
  const onPointerMove = useSpotlight();

  return (
    <button
      type="button"
      className={`rcmud-app-card tone-${item.tone} ${item.wide ? 'is-wide' : ''}`}
      style={{ '--i': index + 3 }}
      data-reveal
      onClick={() => onOpen(item.path)}
      onPointerMove={onPointerMove}
    >
      <span className="rcmud-app-header">
        <span className="rcmud-app-icon"><Icon size={22} strokeWidth={1.8} /></span>
        {item.badge && (
          <span className="rcmud-app-badge">
            {item.live && <i className="rcmud-live-dot" />}
            {item.badge}
          </span>
        )}
      </span>
      <span className="rcmud-app-body">
        <span className="rcmud-app-title">{item.title}</span>
        <span className="rcmud-app-sub">{item.sub}</span>
      </span>
      <span className="rcmud-app-footer">
        <span>{item.cta}</span>
        <ArrowUpRight size={16} />
      </span>
    </button>
  );
});

const AiCard = memo(({ onOpen }) => (
  <button
    type="button"
    className="rcmud-feature-card is-ai"
    style={{ '--i': 1 }}
    data-reveal
    onClick={onOpen}
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
));

const TeamCard = memo(({ onOpen }) => {
  const onPointerMove = useSpotlight();
  return (
    <button
      type="button"
      className="rcmud-feature-card is-team tone-violet"
      style={{ '--i': 2 }}
      data-reveal
      onClick={onOpen}
      onPointerMove={onPointerMove}
      aria-label="Open Team Dekho video call"
    >
      <span className="rcmud-feature-go is-corner" aria-hidden="true">
        <ExternalLink size={14} />
      </span>
      <img src={TEAM_DEKHO_LOGO} alt="Team Dekho" className="rcmud-team-logo" decoding="async" />
    </button>
  );
});

const InstallPill = memo(({ onInstall, onDismiss }) => (
  <div className="rcmud-install" role="region" aria-label="Install app">
    <span className="rcmud-install-icon"><Download size={18} strokeWidth={1.8} /></span>
    <span className="rcmud-install-copy">
      <strong>Install TeamDekho</strong>
      <em>Faster launch and full screen, just like a native app</em>
    </span>
    <button type="button" className="rcmud-install-btn" onClick={onInstall}>Install</button>
    <button type="button" className="rcmud-install-x" onClick={onDismiss} aria-label="Dismiss">
      <X size={16} />
    </button>
  </div>
));

/* --------------------------------- Page --------------------------------- */

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
  const mainRef = useRef(null);

  const firstName = useMemo(() => {
    const name = user?.fullName || 'Partner';
    return name.split(' ')[0];
  }, [user]);

  const initial = firstName.charAt(0).toUpperCase();
  const role = user?.role === 'ADMIN' ? 'Admin' : (user?.status === 'premium' ? 'Premium Partner' : 'Partner');

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return 'Working late';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  // Scroll: passive listener, state only flips at the threshold (React bails out on same value)
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close popovers on outside tap/click (pointerdown covers mouse + touch) and on Escape
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
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setProfileOpen(false);
        setNotifOpen(false);
        setConfirmingLogout(false);
      }
    };
    document.addEventListener('pointerdown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  // Staggered scroll-reveal. One observer, classes are toggled directly on the DOM,
  // so revealing cards causes zero React re-renders.
  useEffect(() => {
    const root = mainRef.current;
    if (!root) return undefined;
    const nodes = root.querySelectorAll('[data-reveal]');

    if (!('IntersectionObserver' in window)) {
      nodes.forEach((n) => n.classList.add('is-in'));
      return undefined;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('is-in');
            io.unobserve(en.target);
          }
        });
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.05 }
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  const performLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const handleVideoCall = useCallback(() => {
    window.open(TEAM_DEKHO_URL, '_blank', 'noopener,noreferrer');
  }, []);

  const openPath = useCallback((path) => navigate(path), [navigate]);
  const openChat = useCallback(() => navigate('/chat'), [navigate]);
  const dismissBanner = useCallback(() => setShowPwaBanner(false), []);

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
              type="button"
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
            <button type="button" className="rcmud-signout" onClick={() => setConfirmingLogout(true)}>
              <LogOut size={17} strokeWidth={1.8} />
              <span>Sign out</span>
            </button>
          ) : (
            <div className="rcmud-signout-confirm">
              <span>Sign out of TeamDekho?</span>
              <div className="rcmud-signout-actions">
                <button type="button" className="rcmud-mini-btn" onClick={() => setConfirmingLogout(false)}>Cancel</button>
                <button type="button" className="rcmud-mini-btn is-danger" onClick={performLogout}>Yes, sign out</button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ---------- MAIN ---------- */}
      <main className="rcmud-main" ref={mainRef}>
        <header className={`rcmud-topbar ${scrolled ? 'is-scrolled' : ''}`}>
          <div className="rcmud-topbar-brand">
            <img src={RCM_LOGO_URL} alt="TeamDekho" />
            <span>Team<span className="rcmud-accent">Dekho</span></span>
          </div>

          <div className="rcmud-topbar-right">
            {supported && (
              <button
                type="button"
                className="rcmud-icon-btn rcmud-bell-toggle"
                onClick={handleNotificationToggle}
                aria-label={enabled ? 'Disable notifications' : 'Enable notifications'}
                aria-pressed={enabled}
                disabled={permission === 'denied' || loading}
                title={permission === 'denied' ? 'Notifications are blocked in your browser settings' : (enabled ? 'Notifications ON' : 'Notifications OFF')}
              >
                {renderBellIcon()}
              </button>
            )}

            <div className="rcmud-profile" ref={notifRef}>
              <button
                type="button"
                className="rcmud-icon-btn"
                aria-label="Notifications"
                aria-expanded={notifOpen}
                onClick={() => setNotifOpen((v) => !v)}
              >
                <Bell size={19} strokeWidth={1.8} />
              </button>

              {notifOpen && (
                <div className="rcmud-profile-sheet">
                  <div className="rcmud-profile-head">
                    <strong className="rcmud-sheet-title">Notifications</strong>
                    <button type="button" className="rcmud-sheet-close" onClick={() => setNotifOpen(false)} aria-label="Close">
                      <X size={16} />
                    </button>
                  </div>
                  <p className="rcmud-empty-note">You're all caught up — nothing new right now.</p>
                </div>
              )}
            </div>

            <div className="rcmud-profile" ref={profileRef}>
              <button
                type="button"
                className="rcmud-avatar-btn"
                onClick={() => setProfileOpen((v) => !v)}
                aria-label="Account menu"
                aria-expanded={profileOpen}
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
                    <button type="button" className="rcmud-sheet-close" onClick={() => setProfileOpen(false)} aria-label="Close">
                      <X size={16} />
                    </button>
                  </div>

                  {!confirmingLogout ? (
                    <button type="button" className="rcmud-sheet-signout" onClick={() => setConfirmingLogout(true)}>
                      <LogOut size={17} strokeWidth={1.8} />
                      <span>Sign out</span>
                    </button>
                  ) : (
                    <div className="rcmud-signout-confirm">
                      <span>Sign out of TeamDekho?</span>
                      <div className="rcmud-signout-actions">
                        <button type="button" className="rcmud-mini-btn" onClick={() => setConfirmingLogout(false)}>Cancel</button>
                        <button type="button" className="rcmud-mini-btn is-danger" onClick={performLogout}>Yes, sign out</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="rcmud-content">
          {/* PWA install: a calm callout at the top of the feed, not a blocking banner */}
          {deferredPrompt && !isAppInstalled && showPwaBanner && (
            <InstallPill onInstall={promptInstall} onDismiss={dismissBanner} />
          )}

          <section className="rcmud-hero" data-reveal style={{ '--i': 0 }}>
            <p className="rcmud-hero-kicker">{greeting}</p>
            <h1>Welcome back, {firstName}</h1>
            <p className="rcmud-hero-sub">Your assistant, training and reports, all in one place.</p>
          </section>

          {/* ---------- The two headline entry points ---------- */}
          <section className="rcmud-feature-grid" aria-label="Quick access">
            <AiCard onOpen={openChat} />
            <TeamCard onOpen={handleVideoCall} />
          </section>

          <section className="rcmud-app-grid" aria-label="Core Modules">
            {MODULES.map((item, i) => (
              <ModuleCard key={item.path} item={item} index={i} onOpen={openPath} />
            ))}
          </section>
        </div>
      </main>
    </div>
  );
};

export default UserDashboard;