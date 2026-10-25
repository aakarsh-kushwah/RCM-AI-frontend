import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Zap, Star, TrendingUp, LogOut, ArrowUpRight, Sparkles, Bell, BellOff, X,
  Film, Download, Package, Youtube, Video, Check
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import usePushNotification from '../../hooks/usePushNotification';
import useInstallPrompt from '../../hooks/useInstallPrompt';
import BrandLogo from '../../components/BrandLogo/BrandLogo'; // <- adjust path to where you put BrandLogo.jsx
import './UserDashboard.css';

// Team Dekho — configurable per environment so it never points at the wrong domain.
const TEAM_DEKHO_URL = process.env.REACT_APP_TEAM_DEKHO_URL || 'https://teamdekho.com';

const PAGE_BG = '#050a0c';   // page background (also fixes the white edges on phones)
const NAV_BG = '#f7fbfa';    // navbar / status bar colour

const NAV_ITEMS = [{ path: '/chat', label: 'Assistant', icon: Zap }];

const MODULES = [
  { path: '/shorts', title: 'RCM Shorts', sub: '60s Micro-Learning & Sales Hacks', cta: 'Explore Feed', icon: Film, tone: 'rose' },
  { path: '/leaders-videos', title: 'Leader Academy', sub: 'Training from top direct-selling leaders', cta: 'Watch Classes', icon: Star, tone: 'teal', badge: 'Academy' },
  { path: '/products-videos', title: 'Product Catalog', sub: 'Browse items with visual guides & demos', cta: 'Browse Products', icon: Package, tone: 'orange', badge: 'Catalog' },
  { path: '/daily-report', title: 'Growth & PV', sub: "Full breakdown of this month's numbers", cta: 'View Reports', icon: TrendingUp, tone: 'green', badge: 'Analytics' },
  { path: '/channels-videos', title: 'Official Channels', sub: 'Auto-synced YouTube feeds & live broadcasts', cta: 'Open Channels', icon: Youtube, tone: 'sky', badge: 'Synced Live', live: true, wide: true }
];

const CAN_HOVER =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

// Cursor spotlight (mouse devices only). Glow moves with transform => no layout/repaint cost.
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

const InstallCard = memo(({ installed, canInstall, showHint, onInstall }) => (
  <section
    className={`rcmud-install ${installed ? 'is-done' : ''}`}
    style={{ '--i': 0 }}
    data-reveal
    aria-label="Install app"
  >
    <span className="rcmud-install-icon">
      {installed ? <Check size={20} strokeWidth={2.4} /> : <Download size={20} strokeWidth={2} />}
    </span>
    <span className="rcmud-install-copy">
      <strong>{installed ? 'TeamDekho app is installed' : 'Get the TeamDekho app'}</strong>
      <em>
        {installed
          ? 'You are all set — launch it from your home screen.'
          : showHint && !canInstall
            ? 'Open your browser menu (⋮ or Share) and tap “Add to Home screen”.'
            : 'Faster launch and full screen, just like a native app.'}
      </em>
    </span>
    {installed ? (
      <span className="rcmud-install-state">Installed</span>
    ) : (
      <button type="button" className="rcmud-install-btn" onClick={onInstall}>
        {canInstall ? 'Install App' : 'How to install'}
      </button>
    )}
  </section>
));

const AiCard = memo(({ onOpen }) => {
  const onPointerMove = useSpotlight();
  return (
    <button
      type="button"
      className="rcmud-feature-card is-ai tone-sky"
      style={{ '--i': 1 }}
      data-reveal
      onClick={onOpen}
      onPointerMove={onPointerMove}
      aria-label="Open your AI assistant"
    >
      <span className="rcmud-ai-shine" aria-hidden="true" />
      <span className="rcmud-ai-icon"><Sparkles size={22} strokeWidth={1.8} /></span>
      <span className="rcmud-feature-copy">
        <span className="rcmud-feature-title">Your Assistant</span>
        <span className="rcmud-feature-sub">Ask about PV, products, training — anything</span>
      </span>
      <span className="rcmud-feature-go" aria-hidden="true"><ArrowUpRight size={18} /></span>
    </button>
  );
});

const TeamCard = memo(({ onOpen }) => {
  const onPointerMove = useSpotlight();
  return (
    <button
      type="button"
      className="rcmud-feature-card is-team tone-teal"
      style={{ '--i': 2 }}
      data-reveal
      onClick={onOpen}
      onPointerMove={onPointerMove}
      aria-label="Start a Team Dekho video meeting"
    >
      <span className="rcmud-team-top">
        <span className="rcmud-team-plate">
          <BrandLogo />
        </span>
        <span className="rcmud-team-chip">
          <i className="rcmud-live-dot" />
          HD Meetings
        </span>
      </span>
      <span className="rcmud-feature-copy">
        <span className="rcmud-feature-title">Start a Video Meeting</span>
        <span className="rcmud-feature-sub">Crystal-clear team calls, up to 90% cheaper than Zoom</span>
      </span>
      <span className="rcmud-team-cta">
        <Video size={16} strokeWidth={2.2} />
        Start Meeting
        <ArrowUpRight size={16} strokeWidth={2.2} />
      </span>
    </button>
  );
});

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
        <span className="rcmud-app-icon"><Icon strokeWidth={1.8} /></span>
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

/* --------------------------------- Page --------------------------------- */

const UserDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { supported, permission, enabled, loading, enable, disable } = usePushNotification();
  const { deferredPrompt, isAppInstalled, promptInstall } = useInstallPrompt();

  const [scrolled, setScrolled] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const profileRef = useRef(null);
  const mainRef = useRef(null);

  const firstName = useMemo(() => (user?.fullName || 'Partner').split(' ')[0], [user]);
  const initial = firstName.charAt(0).toUpperCase();
  const role = user?.role === 'ADMIN' ? 'Admin' : (user?.status === 'premium' ? 'Premium Partner' : 'Partner');

  const canInstall = !!deferredPrompt && !isAppInstalled;

  // Full-screen fix: no white edges on phones / TVs. Everything is restored on unmount.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    const prevHtml = [html.style.background, html.style.colorScheme];
    const prevBody = [body.style.background, body.style.margin];
    const prevRoot = root
      ? [root.style.maxWidth, root.style.padding, root.style.margin, root.style.width, root.style.textAlign]
      : null;

    html.style.background = PAGE_BG;
    html.style.colorScheme = 'dark';
    body.style.background = PAGE_BG;
    body.style.margin = '0';
    if (root) {
      root.style.maxWidth = 'none';
      root.style.padding = '0';
      root.style.margin = '0';
      root.style.width = '100%';
      root.style.textAlign = 'left';
    }

    let theme = document.querySelector('meta[name="theme-color"]');
    const themeCreated = !theme;
    if (!theme) {
      theme = document.createElement('meta');
      theme.setAttribute('name', 'theme-color');
      document.head.appendChild(theme);
    }
    const prevTheme = theme.getAttribute('content');
    theme.setAttribute('content', NAV_BG);

    const vp = document.querySelector('meta[name="viewport"]');
    const prevVp = vp ? vp.getAttribute('content') : null;
    if (vp && !/viewport-fit/.test(prevVp || '')) {
      vp.setAttribute('content', `${prevVp}, viewport-fit=cover`);
    }

    return () => {
      [html.style.background, html.style.colorScheme] = prevHtml;
      [body.style.background, body.style.margin] = prevBody;
      if (root && prevRoot) {
        [root.style.maxWidth, root.style.padding, root.style.margin, root.style.width, root.style.textAlign] = prevRoot;
      }
      if (themeCreated) theme.remove();
      else if (prevTheme !== null) theme.setAttribute('content', prevTheme);
      if (vp && prevVp !== null) vp.setAttribute('content', prevVp);
    };
  }, []);

  // Passive scroll listener; state flips only at the threshold
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close profile popover on outside tap / Escape
  useEffect(() => {
    const handleClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
        setConfirmingLogout(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setProfileOpen(false);
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

  // Staggered scroll-reveal (class toggled on the DOM, zero React re-renders)
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

  const handleInstall = useCallback(() => {
    if (deferredPrompt) promptInstall();
    else setShowHint((v) => !v);
  }, [deferredPrompt, promptInstall]);

  const isItemActive = (item) => location.pathname === item.path;

  const handleNotificationToggle = async () => {
    if (loading || permission === 'denied') return;
    if (enabled) await disable();
    else await enable();
  };

  const renderBellIcon = () => {
    if (loading) {
      return (
        <div className="rcmud-notification-bell rcmud-notification-bell--loading">
          <Bell size={19} strokeWidth={1.8} />
          <span className="rcmud-loading-spinner" />
        </div>
      );
    }
    if (permission === 'denied') {
      return (
        <div className="rcmud-notification-bell rcmud-notification-bell--blocked" title="Notifications are blocked in your browser settings">
          <BellOff size={19} strokeWidth={1.8} />
        </div>
      );
    }
    if (enabled) {
      return (
        <div className="rcmud-notification-bell rcmud-notification-bell--on">
          <Bell size={19} strokeWidth={1.8} />
          <i className="rcmud-dot" />
        </div>
      );
    }
    return (
      <div className="rcmud-notification-bell rcmud-notification-bell--off">
        <Bell size={19} strokeWidth={1.8} />
      </div>
    );
  };

  const signOutConfirm = (
    <div className="rcmud-signout-confirm">
      <span>Sign out of TeamDekho?</span>
      <div className="rcmud-signout-actions">
        <button type="button" className="rcmud-mini-btn" onClick={() => setConfirmingLogout(false)}>Cancel</button>
        <button type="button" className="rcmud-mini-btn is-danger" onClick={performLogout}>Yes, sign out</button>
      </div>
    </div>
  );

  return (
    <div className="rcmud-shell">
      {/* ---------- SIDEBAR (desktop only) ---------- */}
      <aside className="rcmud-side">
        <div className="rcmud-brand-plate">
          <BrandLogo />
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
          ) : signOutConfirm}
        </div>
      </aside>

      {/* ---------- MAIN ---------- */}
      <main className="rcmud-main" ref={mainRef}>
        <header className={`rcmud-topbar ${scrolled ? 'is-scrolled' : ''}`}>
          <div className="rcmud-topbar-brand">
            <BrandLogo />
          </div>

          <div className="rcmud-topbar-right">
            {supported && (
              <button
                type="button"
                className="rcmud-icon-btn"
                onClick={handleNotificationToggle}
                aria-label={enabled ? 'Disable notifications' : 'Enable notifications'}
                aria-pressed={enabled}
                disabled={permission === 'denied' || loading}
                title={permission === 'denied' ? 'Notifications are blocked in your browser settings' : (enabled ? 'Notifications ON' : 'Notifications OFF')}
              >
                {renderBellIcon()}
              </button>
            )}

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
                  ) : signOutConfirm}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="rcmud-content">
          <h1 className="rcmud-sr">Dashboard</h1>

          {/* Always visible install card */}
          <InstallCard
            installed={isAppInstalled}
            canInstall={canInstall}
            showHint={showHint}
            onInstall={handleInstall}
          />

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