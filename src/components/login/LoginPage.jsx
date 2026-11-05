/**
 * @file LoginPage.jsx
 * @description Team Dekho – premium Google OAuth login page.
 *
 * Flow
 *  1. Auth session check  -> spinner while `loading`.
 *  2. Intro splash        -> animated Team Dekho logo (played once per browser session,
 *                            skipped on reduced-motion / click / key press).
 *  3. Login card reveal   -> Google sign-in, with a connected-network showcase on desktop.
 *  4. Success             -> login(user, token) and redirect to the page the user originally
 *                            wanted (safe, same-origin paths only) or /dashboard.
 *
 * Engineering notes
 *  - Every hook runs before any early return (Rules of Hooks).
 *  - In-flight request is aborted on unmount; double submits are blocked with a ref.
 *  - Errors are normalised (timeout / offline / 4xx / 429 / 5xx) into plain language.
 *  - Pointer effects (tilt + spotlight) are throttled with requestAnimationFrame and only
 *    run for a real mouse, never on touch devices or with reduced motion.
 *  - Google button width follows the card width through ResizeObserver.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import { ShieldCheck, Users, Video, TrendingUp, WifiOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';
import BrandLogo from '../BrandLogo/BrandLogo';
import './LoginPage.css';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const INTRO_KEY = 'td_intro_seen_v1';
const INTRO_MS = 2900; // how long the splash plays
const EXIT_MS = 900; // splash dissolve time (keep in sync with CSS)
const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_REDIRECT = '/dashboard';
const FALLBACK_API = 'http://localhost:5000';

/* Showcase network: one leader -> three team leads -> six members */
const NODES = [
    { id: 'root', x: 200, y: 62, r: 15, tier: 0 },
    { id: 'a', x: 88, y: 152, r: 11, tier: 1 },
    { id: 'b', x: 200, y: 152, r: 11, tier: 1 },
    { id: 'c', x: 312, y: 152, r: 11, tier: 1 },
    { id: 'a1', x: 52, y: 248, r: 8, tier: 2 },
    { id: 'a2', x: 124, y: 248, r: 8, tier: 2 },
    { id: 'b1', x: 164, y: 248, r: 8, tier: 2 },
    { id: 'b2', x: 236, y: 248, r: 8, tier: 2 },
    { id: 'c1', x: 276, y: 248, r: 8, tier: 2 },
    { id: 'c2', x: 348, y: 248, r: 8, tier: 2 },
];
const LINKS = [
    ['root', 'a'], ['root', 'b'], ['root', 'c'],
    ['a', 'a1'], ['a', 'a2'], ['b', 'b1'], ['b', 'b2'], ['c', 'c1'], ['c', 'c2'],
];
const NODE_MAP = Object.fromEntries(NODES.map((n) => [n.id, n]));

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const readIntroSeen = () => {
    try {
        return sessionStorage.getItem(INTRO_KEY) === '1';
    } catch {
        return false;
    }
};

const writeIntroSeen = () => {
    try {
        sessionStorage.setItem(INTRO_KEY, '1');
    } catch {
        /* storage blocked – harmless */
    }
};

/** Intro plays only if not seen this session and motion is allowed. */
const shouldPlayIntro = () => !prefersReducedMotion() && !readIntroSeen();

/**
 * Accepts the `from` value ProtectedRoute usually passes in location.state
 * (either a location object or a plain string) and only returns a safe,
 * same-origin path. Anything suspicious falls back to the dashboard.
 */
const getSafeRedirect = (state) => {
    const from = state?.from;
    const path = typeof from === 'string' ? from : from?.pathname
        ? `${from.pathname}${from.search || ''}${from.hash || ''}`
        : '';
    if (!path || !path.startsWith('/') || path.startsWith('//')) return DEFAULT_REDIRECT;
    if (path.startsWith('/login')) return DEFAULT_REDIRECT;
    return path;
};

/** Turns any failure into one clear, human sentence. */
const resolveError = (err) => {
    if (axios.isCancel?.(err)) return null;
    if (err.code === 'ECONNABORTED') {
        return 'The server took too long to respond. Please try again.';
    }
    if (!err.response) {
        return 'Could not reach the server. Check your internet connection and try again.';
    }
    const { status, data } = err.response;
    if (data?.message) return data.message;
    if (status === 429) return 'Too many attempts. Please wait a minute and try again.';
    if (status === 401 || status === 403) return 'This Google account is not allowed to sign in.';
    if (status >= 500) return 'Something went wrong on our side. Please try again shortly.';
    return 'Google sign-in failed. Please try again.';
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const LoginPage = () => {
    /* 1. ALL HOOKS AT THE TOP LEVEL ------------------------------------------------ */
    const { user, login, API_URL, loading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
    const [btnWidth, setBtnWidth] = useState(320);

    const [playIntro] = useState(shouldPlayIntro);
    const [stage, setStage] = useState(playIntro ? 'intro' : 'form'); // 'intro' | 'form'
    const [splashGone, setSplashGone] = useState(!playIntro);

    const busyRef = useRef(false);
    const abortRef = useRef(null);
    const cardRef = useRef(null);
    const btnWrapRef = useRef(null);
    const rafRef = useRef(0);
    const pageRef = useRef(null);

    /* 1b. Lock document scrolling while this page is mounted */
    useEffect(() => {
        const root = document.documentElement;
        root.classList.add('tdlp-lock');
        return () => root.classList.remove('tdlp-lock');
    }, []);

    /* 2. Redirect already-authenticated users --------------------------------------- */
    useEffect(() => {
        if (user) navigate(getSafeRedirect(location.state), { replace: true });
    }, [user, navigate, location.state]);

    /* 3. Intro timeline: starts only after the session check is finished ------------- */
    useEffect(() => {
        if (loading || user || stage !== 'intro') return undefined;
        const t = setTimeout(() => setStage('form'), INTRO_MS);
        return () => clearTimeout(t);
    }, [loading, user, stage]);

    useEffect(() => {
        if (stage !== 'form' || splashGone) return undefined;
        writeIntroSeen();
        const t = setTimeout(() => setSplashGone(true), EXIT_MS);
        return () => clearTimeout(t);
    }, [stage, splashGone]);

    const skipIntro = useCallback(() => setStage('form'), []);

    useEffect(() => {
        if (stage !== 'intro') return undefined;
        const onKey = () => setStage('form');
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [stage]);

    /* 4. Online / offline awareness -------------------------------------------------- */
    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => {
            window.removeEventListener('online', on);
            window.removeEventListener('offline', off);
        };
    }, []);

    /* 5. Cancel any in-flight request + pending frame on unmount ---------------------- */
    useEffect(
        () => () => {
            abortRef.current?.abort();
            cancelAnimationFrame(rafRef.current);
        },
        []
    );

    /* 6. Keep Google button exactly as wide as the card allows ------------------------ */
    useEffect(() => {
        const el = btnWrapRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(([entry]) => {
            const w = Math.round(entry.contentRect.width);
            if (w) setBtnWidth(Math.min(400, Math.max(200, w)));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [loading, user]); // wrapper only exists once the session check is done

    /* 7. Pointer effects (3D tilt on the card + soft spotlight on the page) ----------- */
    const onPointerMove = useCallback((e) => {
        if (e.pointerType !== 'mouse' || prefersReducedMotion()) return;
        const { clientX, clientY } = e;
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            pageRef.current?.style.setProperty('--px', `${clientX}px`);
            pageRef.current?.style.setProperty('--py', `${clientY}px`);
            const card = cardRef.current;
            if (!card) return;
            const r = card.getBoundingClientRect();
            const nx = (clientX - r.left) / r.width - 0.5;
            const ny = (clientY - r.top) / r.height - 0.5;
            const inside = Math.abs(nx) < 0.75 && Math.abs(ny) < 0.75;
            card.style.setProperty('--rx', `${inside ? -ny * 5 : 0}deg`);
            card.style.setProperty('--ry', `${inside ? nx * 6 : 0}deg`);
            card.style.setProperty('--mx', `${(nx + 0.5) * 100}%`);
            card.style.setProperty('--my', `${(ny + 0.5) * 100}%`);
        });
    }, []);

    const onPointerLeave = useCallback(() => {
        cancelAnimationFrame(rafRef.current);
        const card = cardRef.current;
        if (!card) return;
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
    }, []);

    /* 8. Google success handler ------------------------------------------------------ */
    const handleGoogleSuccess = useCallback(
        async (credentialResponse) => {
            if (busyRef.current) return; // block double submit
            if (!credentialResponse?.credential) {
                setError('Google did not return a sign-in token. Please try again.');
                return;
            }

            busyRef.current = true;
            setBusy(true);
            setError('');

            const controller = new AbortController();
            abortRef.current = controller;

            try {
                const { data } = await axios.post(
                    `${API_URL || FALLBACK_API}/api/auth/google`,
                    { credential: credentialResponse.credential },
                    {
                        withCredentials: true, // lets the httpOnly refresh-token cookie be stored
                        timeout: REQUEST_TIMEOUT_MS,
                        signal: controller.signal,
                    }
                );

                if (data?.success && data?.accessToken) {
                    login(data.user, data.accessToken); // also persists to localStorage in AuthContext
                    navigate(getSafeRedirect(location.state), { replace: true });
                    return;
                }
                setError(data?.message || 'Sign-in was not completed. Please try again.');
            } catch (err) {
                const message = resolveError(err);
                if (message) setError(message);
            } finally {
                busyRef.current = false;
                abortRef.current = null;
                setBusy(false);
            }
        },
        [API_URL, login, navigate, location.state]
    );

    const handleGoogleError = useCallback(() => {
        setError('Google sign-in was cancelled or blocked. Allow pop-ups and try again.');
    }, []);

    /* 9. Conditional returns AFTER all hooks ---------------------------------------- */
    if (loading) return <LoadingSpinner message="Checking session..." />;
    if (user) return null;

    const showForm = stage === 'form';

    return (
        <div
            ref={pageRef}
            className={`tdlp-page ${showForm ? 'is-form' : 'is-intro'}`}
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
        >
            {/* ---------- Atmosphere ---------- */}
            <div className="tdlp-bg" aria-hidden="true">
                <span className="tdlp-orb tdlp-orb--1" />
                <span className="tdlp-orb tdlp-orb--2" />
                <span className="tdlp-orb tdlp-orb--3" />
                <span className="tdlp-grain" />
                <span className="tdlp-spot" />
            </div>

            {/* ---------- Intro splash ---------- */}
            {!splashGone && (
                <div
                    className={`tdlp-splash ${showForm ? 'is-leaving' : ''}`}
                    onClick={skipIntro}
                    role="presentation"
                >
                    <div className="tdlp-splash-stage">
                        <svg className="tdlp-orbit" viewBox="0 0 320 320" aria-hidden="true">
                            <defs>
                                <linearGradient id="tdlpRing" x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor="#4f6bff" />
                                    <stop offset="55%" stopColor="#9a5cff" />
                                    <stop offset="100%" stopColor="#12c6d8" />
                                </linearGradient>
                            </defs>
                            <circle className="tdlp-orbit-track" cx="160" cy="160" r="140" />
                            <circle className="tdlp-orbit-draw" cx="160" cy="160" r="140" />
                            <g className="tdlp-orbit-nodes">
                                <circle cx="160" cy="20" r="5" />
                                <circle cx="281" cy="230" r="5" />
                                <circle cx="39" cy="230" r="5" />
                            </g>
                        </svg>
                        <div className="tdlp-splash-logo">
                            <BrandLogo tagline />
                        </div>
                    </div>
                    <span className="tdlp-splash-bar" aria-hidden="true" />
                </div>
            )}

            {/* ---------- Main layout ---------- */}
            <main className="tdlp-shell" aria-hidden={!showForm}>
                {/* Showcase (desktop only) */}
                <section className="tdlp-showcase" aria-label="Team Dekho overview">
                    <h2 className="tdlp-headline">
                        Every strong team begins with one connection.
                    </h2>
                    <p className="tdlp-lead">
                        Meet your network face to face, guide your downline and grow together,
                        all from a single place.
                    </p>

                    <div className="tdlp-net">
                        <svg viewBox="0 0 400 300" className="tdlp-net-svg" aria-hidden="true">
                            <defs>
                                <linearGradient id="tdlpLink" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#7a6cff" />
                                    <stop offset="100%" stopColor="#12c6d8" />
                                </linearGradient>
                                <radialGradient id="tdlpNode" cx="35%" cy="30%" r="80%">
                                    <stop offset="0%" stopColor="#ffffff" />
                                    <stop offset="100%" stopColor="#c9d4ff" />
                                </radialGradient>
                            </defs>
                            {LINKS.map(([from, to], i) => {
                                const a = NODE_MAP[from];
                                const b = NODE_MAP[to];
                                const my = (a.y + b.y) / 2;
                                return (
                                    <path
                                        key={`${from}-${to}`}
                                        className="tdlp-link"
                                        style={{ '--i': i }}
                                        d={`M${a.x} ${a.y} C${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`}
                                    />
                                );
                            })}
                            {NODES.map((n, i) => (
                                <g key={n.id} className={`tdlp-node tier-${n.tier}`} style={{ '--i': i }}>
                                    <circle className="tdlp-node-halo" cx={n.x} cy={n.y} r={n.r + 9} />
                                    <circle className="tdlp-node-core" cx={n.x} cy={n.y} r={n.r} />
                                </g>
                            ))}
                        </svg>

                        <div className="tdlp-chip tdlp-chip--a">
                            <Users size={15} strokeWidth={2.2} /> Team network
                        </div>
                        <div className="tdlp-chip tdlp-chip--b">
                            <Video size={15} strokeWidth={2.2} /> Live meetings
                        </div>
                        <div className="tdlp-chip tdlp-chip--c">
                            <TrendingUp size={15} strokeWidth={2.2} /> Growth insights
                        </div>
                    </div>
                </section>

                {/* Login card */}
                <section className="tdlp-side">
                    <div className="tdlp-card-wrap">
                        <div ref={cardRef} className="tdlp-card">
                            <span className="tdlp-card-edge" aria-hidden="true" />
                            <span className="tdlp-card-sheen" aria-hidden="true" />

                            <div className="tdlp-card-inner">
                                <div className="tdlp-r" style={{ '--d': '0ms' }}>
                                    <BrandLogo tagline className="tdlp-card-logo" />
                                </div>

                                <h1 className="tdlp-title tdlp-r" style={{ '--d': '90ms' }}>
                                    Welcome back
                                </h1>
                                <p className="tdlp-subtitle tdlp-r" style={{ '--d': '160ms' }}>
                                    Sign in to join your meetings, manage your team and track your growth.
                                </p>

                                {!online && (
                                    <div className="tdlp-note" role="status">
                                        <WifiOff size={16} strokeWidth={2.2} />
                                        <span>You are offline. Reconnect to sign in.</span>
                                    </div>
                                )}

                                {error && (
                                    <div className="tdlp-error" role="alert">
                                        <AlertCircle size={16} strokeWidth={2.2} />
                                        <span>{error}</span>
                                    </div>
                                )}

                                <div
                                    ref={btnWrapRef}
                                    className={`tdlp-google tdlp-r ${busy ? 'is-busy' : ''} ${!online ? 'is-disabled' : ''}`}
                                    style={{ '--d': '240ms' }}
                                    aria-busy={busy}
                                >
                                    <div className="tdlp-gshell">
                                        {/* Our own big, branded button (visual only) */}
                                        <div className="tdlp-gbtn" aria-hidden="true">
                                            <svg className="tdlp-g" viewBox="0 0 48 48">
                                                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                                                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                                                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                                                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                                            </svg>
                                            <span>Continue with Google</span>
                                        </div>

                                        {/* Real Google button sits invisibly on top, so the ID-token flow is unchanged */}
                                        <div className="tdlp-ghit">
                                            <div className="tdlp-ghit-inner">
                                                <GoogleLogin
                                                    onSuccess={handleGoogleSuccess}
                                                    onError={handleGoogleError}
                                                    theme="outline"
                                                    shape="pill"
                                                    size="large"
                                                    text="continue_with"
                                                    width={btnWidth}
                                                    auto_select={false}
                                                />
                                            </div>
                                        </div>

                                        {busy && (
                                            <div className="tdlp-busy" role="status">
                                                <span className="tdlp-busy-dot" />
                                                Signing you in…
                                            </div>
                                        )}
                                    </div>
                                    <span className="tdlp-gline" aria-hidden="true" />
                                </div>

                                <div className="tdlp-trust tdlp-r" style={{ '--d': '320ms' }}>
                                    <span><Users size={14} strokeWidth={2.2} /> Your team</span>
                                    <span><Video size={14} strokeWidth={2.2} /> Your meetings</span>
                                    <span><TrendingUp size={14} strokeWidth={2.2} /> Your growth</span>
                                </div>

                                <p className="tdlp-fineprint tdlp-r" style={{ '--d': '380ms' }}>
                                    <ShieldCheck size={13} strokeWidth={2} />
                                    Protected by enterprise-grade encryption
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
};

export default LoginPage;