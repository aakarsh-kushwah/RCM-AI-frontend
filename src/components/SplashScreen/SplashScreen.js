/**
 * @file SplashScreen.jsx
 * @description Team Dekho app-open splash: the animated logo intro (same look as the login theme).
 *
 * Usage (parent decides when to show it):
 *   if (showSplash) return <SplashScreen onComplete={() => setShowSplash(false)} />;
 *
 * Behaviour
 *  - Plays the logo motion, then dissolves and calls `onComplete` once.
 *  - Tap / click / any key skips straight to the exit.
 *  - With "reduce motion" turned on it shows briefly and leaves quickly.
 *  - Marks the login intro as already seen, so the logo is not played a second time on /login.
 *  - Only transform / opacity animate, so it stays smooth on budget phones.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import BrandLogo from '../BrandLogo/BrandLogo'; // same logo the login page uses (adjust the path if needed)
import './SplashScreen.css';

const HOLD_MS = 2700; // how long the logo motion plays
const EXIT_MS = 700; // dissolve time (keep in sync with CSS)
const REDUCED_HOLD_MS = 700;
const INTRO_KEY = 'td_intro_seen_v1'; // same key as LoginPage, so its own intro is skipped

const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const SplashScreen = ({ onComplete, holdMs }) => {
    const [leaving, setLeaving] = useState(false);
    const doneRef = useRef(false);
    const onCompleteRef = useRef(onComplete);

    // always call the latest callback without restarting the timers
    useEffect(() => {
        onCompleteRef.current = onComplete;
    });

    const leave = useCallback(() => setLeaving(true), []);

    // Lock page scroll, paint the page behind the splash, and mark the intro as seen
    useEffect(() => {
        const root = document.documentElement;
        root.classList.add('tdsp-lock');
        try {
            sessionStorage.setItem(INTRO_KEY, '1');
        } catch {
            /* storage blocked – harmless */
        }
        return () => root.classList.remove('tdsp-lock');
    }, []);

    // Timeline: hold -> leave -> notify parent (once)
    useEffect(() => {
        const hold = prefersReducedMotion() ? REDUCED_HOLD_MS : (holdMs ?? HOLD_MS);
        const t = setTimeout(leave, hold);
        return () => clearTimeout(t);
    }, [holdMs, leave]);

    useEffect(() => {
        if (!leaving) return undefined;
        const t = setTimeout(() => {
            if (doneRef.current) return;
            doneRef.current = true;
            onCompleteRef.current?.();
        }, prefersReducedMotion() ? 0 : EXIT_MS);
        return () => clearTimeout(t);
    }, [leaving]);

    // Any key skips
    useEffect(() => {
        window.addEventListener('keydown', leave);
        return () => window.removeEventListener('keydown', leave);
    }, [leave]);

    return (
        <div
            className={`tdsp-root ${leaving ? 'is-leaving' : ''}`}
            onClick={leave}
            role="status"
            aria-label="Loading Team Dekho"
        >
            {/* Atmosphere */}
            <div className="tdsp-bg" aria-hidden="true">
                <span className="tdsp-orb tdsp-orb--1" />
                <span className="tdsp-orb tdsp-orb--2" />
                <span className="tdsp-orb tdsp-orb--3" />
                <span className="tdsp-grain" />
            </div>

            <div className="tdsp-stage">
                <svg className="tdsp-orbit" viewBox="0 0 320 320" aria-hidden="true">
                    <defs>
                        <linearGradient id="tdspRing" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#4f6bff" />
                            <stop offset="55%" stopColor="#9a5cff" />
                            <stop offset="100%" stopColor="#12c6d8" />
                        </linearGradient>
                    </defs>
                    <circle className="tdsp-orbit-track" cx="160" cy="160" r="140" />
                    <circle className="tdsp-orbit-draw" cx="160" cy="160" r="140" />
                    <g className="tdsp-orbit-nodes">
                        <circle cx="160" cy="20" r="5" />
                        <circle cx="281" cy="230" r="5" />
                        <circle cx="39" cy="230" r="5" />
                    </g>
                </svg>

                <div className="tdsp-logo">
                    <BrandLogo tagline />
                </div>
            </div>

            <span className="tdsp-bar" aria-hidden="true" />
        </div>
    );
};

export default SplashScreen;