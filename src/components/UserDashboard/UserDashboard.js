/**
 * @file UserDashboard.jsx
 * @description Team Dekho – premium partner dashboard.
 *
 * Built to stay cheap at very high traffic:
 *  - No scroll listener: the "scrolled" top-bar state comes from an IntersectionObserver sentinel.
 *  - One delegated pointer handler (rAF-throttled) drives the card spotlight instead of one per card.
 *  - Every card is memoised and receives only primitives, so a state change (menu open, bell
 *    toggle...) never re-renders the grids.
 *  - Document listeners (outside click / Escape) exist only while the profile menu is open.
 *  - Reveal animation is toggled on the DOM (zero React renders) and is armed before first paint.
 *  - Cards are real <Link>/<a> elements: native prefetch-friendly, middle-click, right-click,
 *    no popup-blocker issue for the meeting link, and no button-inside-button nesting.
 */

import React, {
    useState,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useCallback,
    memo,
} from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
    ChevronRight, Zap, Star, TrendingUp, LogOut, ArrowUpRight, Sparkles, Bell, BellOff, X,
    Film, Download, Package, Youtube, Video, Check, Crown, Award, Trophy,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import usePushNotification from '../../hooks/usePushNotification';
import useInstallPrompt from '../../hooks/useInstallPrompt';
import BrandLogo from '../../components/BrandLogo/BrandLogo'; // <- adjust path to where you put BrandLogo.jsx
import './UserDashboard.css';

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

// Team Dekho – configurable per environment so it never points at the wrong domain.
const TEAM_DEKHO_URL = process.env.REACT_APP_TEAM_DEKHO_URL || 'https://teamdekho.com';

const PAGE_BG = '#f4f5fc'; // page background (also removes white edges on phones)
const NAV_BG = '#f4f5fc'; // status-bar colour

const NAV_ITEMS = [{ path: '/chat', label: 'Assistant', icon: Zap }];

const MODULES = [
    { path: '/lifelines', title: 'Lifelines', alt: 'लाइफ लाइन', sub: 'Sync and explore your network tree with live stats', cta: 'Open Lifelines', icon: TrendingUp, tone: 'violet', badge: 'Tree' },
    { path: '/shorts', title: 'Shorts', sub: '60s micro-learning and sales hacks', cta: 'Explore Feed', icon: Film, tone: 'rose' },
    { path: '/leaders-videos', title: 'Leader Academy', sub: 'Training from top direct-selling leaders', cta: 'Watch Classes', icon: Star, tone: 'teal', badge: 'Academy' },
    { path: '/products-videos', title: 'Product Catalog', sub: 'Browse items with visual guides and demos', cta: 'Browse Products', icon: Package, tone: 'orange', badge: 'Catalog' },
    { path: '/daily-report', title: 'Growth & PV', sub: "Full breakdown of this month's numbers", cta: 'View Reports', icon: TrendingUp, tone: 'green', badge: 'Analytics' },
    { path: '/channels-videos', title: 'Official Channels', sub: 'Auto-synced YouTube feeds and live broadcasts', cta: 'Open Channels', icon: Youtube, tone: 'sky', badge: 'Synced live', live: true, wide: true },
];

/* ------------------------------------------------------------------ */
/* Helpers / hooks                                                     */
/* ------------------------------------------------------------------ */

const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 5) return 'Working late';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
};

const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Full-screen chrome: page colour, #root reset, status-bar colour, viewport-fit=cover.
 * Everything touched is restored on unmount so other routes are unaffected.
 */
const useDocumentChrome = () => {
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
        html.style.colorScheme = 'light';
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
};

/**
 * One delegated, rAF-throttled spotlight for every `[data-spot]` card inside the element
 * the returned handler is attached to. Mouse only; touch devices never run it.
 */
const useSpotlight = () => {
    const raf = useRef(0);
    const pending = useRef(null);

    useEffect(() => () => cancelAnimationFrame(raf.current), []);

    return useCallback((e) => {
        if (e.pointerType !== 'mouse') return;
        const el = e.target.closest?.('[data-spot]');
        if (!el) return;
        pending.current = { el, x: e.clientX, y: e.clientY };
        if (raf.current) return;
        raf.current = requestAnimationFrame(() => {
            raf.current = 0;
            const p = pending.current;
            if (!p) return;
            const r = p.el.getBoundingClientRect();
            p.el.style.setProperty('--mx', `${p.x - r.left}px`);
            p.el.style.setProperty('--my', `${p.y - r.top}px`);
        });
    }, []);
};

/* ------------------------------------------------------------------ */
/* Small memoised pieces                                               */
/* ------------------------------------------------------------------ */

const Avatar = memo(({ src, initial, className = '' }) => {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [src]);

    if (src && !failed) {
        return (
            <img
                src={src}
                alt=""
                className={`tdud-avatar tdud-avatar--img ${className}`}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setFailed(true)}
            />
        );
    }
    return <span className={`tdud-avatar ${className}`} aria-hidden="true">{initial}</span>;
});

const BellButton = memo(({ supported, permission, enabled, loading, onToggle }) => {
    if (!supported) return null;
    const blocked = permission === 'denied';
    const state = loading ? 'loading' : blocked ? 'blocked' : enabled ? 'on' : 'off';
    const Icon = blocked ? BellOff : Bell;
    const title = blocked
        ? 'Notifications are blocked in your browser settings'
        : enabled ? 'Notifications ON' : 'Notifications OFF';

    return (
        <button
            type="button"
            className={`tdud-icon-btn is-${state}`}
            onClick={onToggle}
            aria-label="Notifications"
            aria-pressed={enabled}
            disabled={blocked || loading}
            title={title}
        >
            <Icon size={20} strokeWidth={1.8} />
            {state === 'on' && <i className="tdud-dot" aria-hidden="true" />}
            {state === 'loading' && <span className="tdud-spin" aria-hidden="true" />}
        </button>
    );
});

const SignOutConfirm = memo(({ onCancel, onConfirm }) => (
    <div className="tdud-confirm" role="alertdialog" aria-label="Confirm sign out">
        <span>Sign out of Team Dekho?</span>
        <div className="tdud-confirm-actions">
            <button type="button" className="tdud-mini" onClick={onCancel}>Cancel</button>
            <button type="button" className="tdud-mini is-danger" onClick={onConfirm}>Yes, sign out</button>
        </div>
    </div>
));

const Hero = memo(({ greeting, firstName, initial, image, role, premium, pins }) => (
    <section className="tdud-hero" data-reveal style={{ '--i': 0 }} aria-label="Welcome">
        <svg className="tdud-hero-art" viewBox="0 0 260 200" aria-hidden="true">
            <g className="tdud-art-links">
                <path d="M130 30 C130 60 60 60 60 100" />
                <path d="M130 30 C130 60 130 60 130 100" />
                <path d="M130 30 C130 60 200 60 200 100" />
                <path d="M60 100 C60 130 30 130 30 165" />
                <path d="M60 100 C60 130 90 130 90 165" />
                <path d="M130 100 C130 130 115 130 115 165" />
                <path d="M130 100 C130 130 145 130 145 165" />
                <path d="M200 100 C200 130 170 130 170 165" />
                <path d="M200 100 C200 130 230 130 230 165" />
            </g>
            <g className="tdud-art-nodes">
                <circle cx="130" cy="30" r="9" className="is-root" />
                <circle cx="60" cy="100" r="7" />
                <circle cx="130" cy="100" r="7" />
                <circle cx="200" cy="100" r="7" />
                <circle cx="30" cy="165" r="5" />
                <circle cx="90" cy="165" r="5" />
                <circle cx="115" cy="165" r="5" />
                <circle cx="145" cy="165" r="5" />
                <circle cx="170" cy="165" r="5" />
                <circle cx="230" cy="165" r="5" />
            </g>
        </svg>

        <div className="tdud-hero-main">
            <span className="tdud-hero-avatar">
                <Avatar src={image} initial={initial} />
            </span>
            <div className="tdud-hero-text">
                <p className="tdud-hello">{greeting}</p>
                <p className="tdud-name">{firstName}</p>
                <span className={`tdud-tier ${premium ? 'is-premium' : ''}`}>
                    {premium && <Crown size={14} strokeWidth={2.2} />}
                    {role}
                </span>
            </div>
        </div>

        {pins.length > 0 && (
            <dl className="tdud-pins">
                {pins.map(({ key, label, value, Icon }) => (
                    <div className="tdud-pin" key={key}>
                        <span className="tdud-pin-icon"><Icon size={16} strokeWidth={2} /></span>
                        <span className="tdud-pin-copy">
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                        </span>
                    </div>
                ))}
            </dl>
        )}
    </section>
));

const InstallCard = memo(({ installed, canInstall, showHint, onInstall }) => (
    <section
        className={`tdud-install ${installed ? 'is-done' : ''}`}
        data-reveal
        style={{ '--i': 1 }}
        aria-label="Install app"
    >
        <span className="tdud-install-icon">
            {installed ? <Check size={20} strokeWidth={2.4} /> : <Download size={20} strokeWidth={2} />}
        </span>
        <span className="tdud-install-copy" aria-live="polite">
            <strong>{installed ? 'Team Dekho app is installed' : 'Get the Team Dekho app'}</strong>
            <em>
                {installed
                    ? 'You are all set. Launch it from your home screen.'
                    : showHint && !canInstall
                        ? 'Open your browser menu (⋮ or Share) and tap “Add to Home screen”.'
                        : 'Faster launch and full screen, just like a native app.'}
            </em>
        </span>
        {installed ? (
            <span className="tdud-install-state">Installed</span>
        ) : (
            <button type="button" className="tdud-install-btn" onClick={onInstall}>
                {canInstall ? 'Install app' : 'How to install'}
            </button>
        )}
    </section>
));

const AiCard = memo(({ isPremium }) => (
    <article className="tdud-feature tdud-feature--ai" data-spot data-reveal style={{ '--i': 2 }}>
        <Link to="/chat" className="tdud-feature-link" aria-label="Open your AI assistant">
            <span className="tdud-tile tdud-tile--ai"><Sparkles size={24} strokeWidth={1.8} /></span>
            <span className="tdud-feature-copy">
                <span className="tdud-feature-title">Your Assistant</span>
                <span className="tdud-feature-sub">Ask about PV, products, training, anything</span>
            </span>
            <span className="tdud-cta">
                <span>Open assistant</span>
                <ArrowUpRight size={16} strokeWidth={2.2} />
            </span>
        </Link>
        {isPremium ? (
            <span className="tdud-pro" aria-label="Pro user"><Crown size={13} strokeWidth={2.4} /> PRO</span>
        ) : (
            <Link to="/payment-setup" className="tdud-upgrade-pill" aria-label="Upgrade to Pro">
                Upgrade <ChevronRight size={14} />
            </Link>
        )}
    </article>
));

const TeamCard = memo(() => (
    <article className="tdud-feature tdud-feature--team" data-spot data-reveal style={{ '--i': 3 }}>
        <a
            href={TEAM_DEKHO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="tdud-feature-link"
            aria-label="Start a Team Dekho video meeting (opens in a new tab)"
        >
            <span className="tdud-team-top">
                <span className="tdud-plate"><BrandLogo /></span>
                <span className="tdud-chip"><i className="tdud-live-dot" /> HD Meetings</span>
            </span>
            <span className="tdud-feature-copy">
                <span className="tdud-feature-title">Start a Video Meeting</span>
                <span className="tdud-feature-sub">Crystal-clear team calls, up to 90% cheaper than Zoom</span>
            </span>
            <span className="tdud-cta tdud-cta--aqua">
                <Video size={16} strokeWidth={2.2} />
                <span>Start Meeting</span>
                <ArrowUpRight size={16} strokeWidth={2.2} />
            </span>
        </a>
    </article>
));

const UpgradeBanner = memo(() => (
    <section className="tdud-upgrade" data-reveal style={{ '--i': 4 }} aria-label="Upgrade to Pro">
        <span className="tdud-upgrade-icon"><Sparkles size={20} strokeWidth={2} /></span>
        <span className="tdud-upgrade-text">
            <strong>Unlock Pro AI &amp; Tools</strong>
            <span>Unlimited 24x7 AI chat support, downline tracking and business calculators.</span>
        </span>
        <Link to="/payment-setup" className="tdud-upgrade-btn">
            Upgrade to Pro <ChevronRight size={16} />
        </Link>
    </section>
));

const ModuleCard = memo(({ item, index }) => {
    const Icon = item.icon;
    return (
        <Link
            to={item.path}
            className={`tdud-app ${item.wide ? 'is-wide' : ''}`}
            data-tone={item.tone}
            data-spot
            data-reveal
            style={{ '--i': index + 5 }}
        >
            <span className="tdud-app-head">
                <span className="tdud-tile"><Icon size={22} strokeWidth={1.9} /></span>
                {item.badge && (
                    <span className="tdud-badge">
                        {item.live && <i className="tdud-live-dot" />}
                        {item.badge}
                    </span>
                )}
            </span>
            <span className="tdud-app-body">
                <span className="tdud-app-title">{item.title}</span>
                {item.alt && <span className="tdud-app-alt">{item.alt}</span>}
                <span className="tdud-app-sub">{item.sub}</span>
            </span>
            <span className="tdud-app-foot">
                <span>{item.cta}</span>
                <span className="tdud-go" aria-hidden="true"><ArrowUpRight size={16} strokeWidth={2.2} /></span>
            </span>
        </Link>
    );
});

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

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
    const sentinelRef = useRef(null);
    const loggingOutRef = useRef(false);

    const onSpotlight = useSpotlight();
    useDocumentChrome();

    /* ----- derived (computed once per user change) ----- */
    const isPremium = user?.status === 'premium';
    const greeting = useMemo(getGreeting, []);
    const firstName = useMemo(() => (user?.fullName || 'Partner').trim().split(/\s+/)[0], [user?.fullName]);
    const initial = firstName.charAt(0).toUpperCase();
    const role = user?.role === 'ADMIN' ? 'Admin' : isPremium ? 'Premium Partner' : 'Partner';
    const image = user?.user_image || '';
    const canInstall = !!deferredPrompt && !isAppInstalled;

    const pins = useMemo(() => {
        const current = user?.pin_data?.current_pin_name?.pin_description;
        const max = user?.pin_data?.max_pin_name?.pin_description;
        return [
            current && { key: 'current', label: 'Current pin', value: current, Icon: Award },
            max && { key: 'max', label: 'Max pin', value: max, Icon: Trophy },
        ].filter(Boolean);
    }, [user?.pin_data]);

    /* ----- "scrolled" top bar via sentinel (no scroll listener) ----- */
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || !('IntersectionObserver' in window)) return undefined;
        const io = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), { threshold: 0 });
        io.observe(el);
        return () => io.disconnect();
    }, []);

    /* ----- profile menu: listeners only while it is open ----- */
    useEffect(() => {
        if (!profileOpen) return undefined;
        const close = () => {
            setProfileOpen(false);
            setConfirmingLogout(false);
        };
        const onPointerDown = (e) => {
            if (profileRef.current && !profileRef.current.contains(e.target)) close();
        };
        const onKey = (e) => {
            if (e.key === 'Escape') close();
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [profileOpen]);

    /* ----- staggered reveal: armed before first paint, no React renders ----- */
    useLayoutEffect(() => {
        const root = mainRef.current;
        if (!root || !('IntersectionObserver' in window) || prefersReducedMotion()) return undefined;

        root.classList.add('is-armed');
        const nodes = root.querySelectorAll('[data-reveal]:not(.is-in)');
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
    }, [isPremium]); // the upgrade banner mounts/unmounts with premium status

    /* ----- actions ----- */
    const performLogout = useCallback(async () => {
        if (loggingOutRef.current) return;
        loggingOutRef.current = true;
        try {
            await logout();
        } catch {
            /* even if the server call fails, leave the dashboard */
        } finally {
            navigate('/login', { replace: true });
        }
    }, [logout, navigate]);

    const handleInstall = useCallback(() => {
        if (deferredPrompt) promptInstall();
        else setShowHint((v) => !v);
    }, [deferredPrompt, promptInstall]);

    const handleNotificationToggle = useCallback(async () => {
        if (loading || permission === 'denied') return;
        try {
            if (enabled) await disable();
            else await enable();
        } catch {
            /* the hook surfaces its own state; never leave an unhandled rejection */
        }
    }, [loading, permission, enabled, enable, disable]);

    const askLogout = useCallback(() => setConfirmingLogout(true), []);
    const cancelLogout = useCallback(() => setConfirmingLogout(false), []);
    const toggleProfile = useCallback(() => setProfileOpen((v) => !v), []);
    const closeProfile = useCallback(() => setProfileOpen(false), []);

    /* ----- render ----- */
    return (
        <div className="tdud-shell">
            {/* ---------- SIDEBAR (desktop) ---------- */}
            <aside className="tdud-side">
                <div className="tdud-brand-plate">
                    <BrandLogo />
                </div>

                <div className="tdud-identity">
                    <Avatar src={image} initial={initial} className="tdud-avatar--lg" />
                    <span className="tdud-identity-text">
                        <span className="tdud-identity-name">{firstName}</span>
                        <span className="tdud-identity-role">{role}</span>
                    </span>
                </div>

                <nav className="tdud-nav" aria-label="Primary">
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const active = location.pathname === item.path;
                        return (
                            <Link
                                key={item.label}
                                to={item.path}
                                className={`tdud-nav-item ${active ? 'is-active' : ''}`}
                                aria-current={active ? 'page' : undefined}
                            >
                                <Icon size={19} strokeWidth={1.8} />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="tdud-signout-zone">
                    {!confirmingLogout ? (
                        <button type="button" className="tdud-signout" onClick={askLogout}>
                            <LogOut size={17} strokeWidth={1.8} />
                            <span>Sign out</span>
                        </button>
                    ) : (
                        <SignOutConfirm onCancel={cancelLogout} onConfirm={performLogout} />
                    )}
                </div>
            </aside>

            {/* ---------- MAIN ---------- */}
            <main className="tdud-main" ref={mainRef}>
                <span ref={sentinelRef} className="tdud-sentinel" aria-hidden="true" />

                <header className={`tdud-topbar ${scrolled ? 'is-scrolled' : ''}`}>
                    <div className="tdud-topbar-brand">
                        <BrandLogo />
                    </div>

                    <div className="tdud-topbar-right">
                        <BellButton
                            supported={supported}
                            permission={permission}
                            enabled={enabled}
                            loading={loading}
                            onToggle={handleNotificationToggle}
                        />

                        <div className="tdud-profile" ref={profileRef}>
                            <button
                                type="button"
                                className="tdud-avatar-btn"
                                onClick={toggleProfile}
                                aria-label="Account menu"
                                aria-expanded={profileOpen}
                                aria-haspopup="dialog"
                            >
                                <Avatar src={image} initial={initial} />
                            </button>

                            {profileOpen && (
                                <div className="tdud-sheet" role="dialog" aria-label="Account">
                                    <div className="tdud-sheet-head">
                                        <Avatar src={image} initial={initial} className="tdud-avatar--lg" />
                                        <span className="tdud-sheet-who">
                                            <strong>{firstName}</strong>
                                            <em>{role}</em>
                                        </span>
                                        <button type="button" className="tdud-sheet-close" onClick={closeProfile} aria-label="Close">
                                            <X size={16} />
                                        </button>
                                    </div>

                                    {pins.length > 0 && (
                                        <ul className="tdud-sheet-pins">
                                            {pins.map(({ key, label, value }) => (
                                                <li key={key}><span>{label}</span><strong>{value}</strong></li>
                                            ))}
                                        </ul>
                                    )}

                                    {!confirmingLogout ? (
                                        <button type="button" className="tdud-sheet-signout" onClick={askLogout}>
                                            <LogOut size={17} strokeWidth={1.8} />
                                            <span>Sign out</span>
                                        </button>
                                    ) : (
                                        <SignOutConfirm onCancel={cancelLogout} onConfirm={performLogout} />
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <div className="tdud-content" onPointerMove={onSpotlight}>
                    <h1 className="tdud-sr">Dashboard</h1>

                    <Hero
                        greeting={greeting}
                        firstName={firstName}
                        initial={initial}
                        image={image}
                        role={role}
                        premium={isPremium}
                        pins={pins}
                    />

                    {/* Always visible install card */}
                    <InstallCard
                        installed={isAppInstalled}
                        canInstall={canInstall}
                        showHint={showHint}
                        onInstall={handleInstall}
                    />

                    <section aria-labelledby="tdud-h-quick">
                        <h2 className="tdud-h2" id="tdud-h-quick">Quick access</h2>
                        <div className="tdud-feature-grid">
                            <AiCard isPremium={isPremium} />
                            <TeamCard />
                        </div>
                    </section>

                    {!isPremium && <UpgradeBanner />}

                    <section aria-labelledby="tdud-h-tools">
                        <h2 className="tdud-h2" id="tdud-h-tools">Your toolkit</h2>
                        <div className="tdud-app-grid">
                            {MODULES.map((item, i) => (
                                <ModuleCard key={item.path} item={item} index={i} />
                            ))}
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
};

export default UserDashboard;