/**
 * @file useInstallPrompt.js
 * @description PWA install state as a tiny module-level store.
 *
 * Why a store and not component state:
 *  - `beforeinstallprompt` fires once per page load; the dashboard may mount long after it.
 *  - The state must survive route changes and logout -> login (the dashboard unmounts).
 *  - Any number of components can subscribe without prop drilling or extra listeners.
 *
 * Installed detection (in order):
 *  1. Running standalone / minimal-ui  -> definitely installed.
 *  2. `appinstalled` event / accepted prompt -> installed (persisted in localStorage + cookie,
 *     the cookie survives anything that wipes localStorage on logout).
 *  3. `beforeinstallprompt` firing in a normal tab -> NOT installed (clears a stale flag,
 *     e.g. after the user uninstalled the app).
 *
 * status: 'idle' | 'prompting' | 'installing' | 'installed'
 */

import { useSyncExternalStore } from 'react';

const FLAG_KEY = 'td_pwa_installed_v1';
const COOKIE_NAME = 'td_pwa_installed';
const INSTALL_FALLBACK_MS = 25000; // if `appinstalled` never arrives after an accepted prompt

const hasWindow = typeof window !== 'undefined';

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

const readFlag = () => {
    if (!hasWindow) return false;
    try {
        if (window.localStorage.getItem(FLAG_KEY) === '1') return true;
    } catch {
        /* storage blocked */
    }
    return document.cookie.split('; ').includes(`${COOKIE_NAME}=1`);
};

const writeFlag = () => {
    try {
        window.localStorage.setItem(FLAG_KEY, '1');
    } catch {
        /* storage blocked */
    }
    document.cookie = `${COOKIE_NAME}=1; max-age=31536000; path=/; SameSite=Lax`;
};

const clearFlag = () => {
    try {
        window.localStorage.removeItem(FLAG_KEY);
    } catch {
        /* storage blocked */
    }
    document.cookie = `${COOKIE_NAME}=; max-age=0; path=/; SameSite=Lax`;
};

/* ------------------------------------------------------------------ */
/* Environment                                                         */
/* ------------------------------------------------------------------ */

const detectStandalone = () => {
    if (!hasWindow) return false;
    const mq = (q) => typeof window.matchMedia === 'function' && window.matchMedia(q).matches;
    return mq('(display-mode: standalone)') || mq('(display-mode: minimal-ui)') || window.navigator.standalone === true;
};

const detectIOS = () => {
    if (!hasWindow) return false;
    const ua = window.navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
};

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

const listeners = new Set();
let promptEvent = null;
let watchdog = null;
let initialised = false;

let snapshot = {
    canInstall: false,
    installed: false,
    standalone: false,
    isIOS: false,
    status: 'idle',
};

const serverSnapshot = snapshot;

const setState = (patch) => {
    const next = { ...snapshot, ...patch };
    const changed = Object.keys(next).some((k) => next[k] !== snapshot[k]);
    if (!changed) return;
    snapshot = next;
    listeners.forEach((l) => l());
};

const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
const getSnapshot = () => snapshot;
const getServerSnapshot = () => serverSnapshot;

const markInstalled = () => {
    clearTimeout(watchdog);
    watchdog = null;
    promptEvent = null;
    if (hasWindow) window.__pwaPrompt = null;
    writeFlag();
    setState({ installed: true, status: 'installed', canInstall: false });
};

const acceptPrompt = (event) => {
    // A prompt event only exists when the app is NOT installed -> drop any stale flag.
    if (snapshot.status === 'installing' || snapshot.status === 'prompting') return;
    if (snapshot.installed && snapshot.standalone) return;
    promptEvent = event;
    window.__pwaPrompt = event;
    clearFlag();
    setState({ canInstall: true, installed: false, status: 'idle' });
};

/** Idempotent. Call once, as early as possible (src/index.js). */
export const initInstallPrompt = () => {
    if (!hasWindow || initialised) return;
    initialised = true;

    const standalone = detectStandalone();
    if (standalone) writeFlag();

    setState({
        standalone,
        isIOS: detectIOS(),
        installed: standalone || readFlag(),
        status: standalone || readFlag() ? 'installed' : 'idle',
    });

    // The inline script in index.html may already have caught the event.
    if (window.__pwaPrompt && !standalone) acceptPrompt(window.__pwaPrompt);

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        acceptPrompt(e);
    });

    window.addEventListener('appinstalled', markInstalled);

    if (typeof window.matchMedia === 'function') {
        const mq = window.matchMedia('(display-mode: standalone)');
        const onChange = (e) => {
            if (e.matches) {
                setState({ standalone: true });
                markInstalled();
            }
        };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else if (mq.addListener) mq.addListener(onChange);
    }
};

/**
 * Opens the browser's native install dialog.
 * MUST be called straight from a user gesture (click) – nothing async before `prompt()`.
 * @returns {Promise<'accepted'|'dismissed'|'unavailable'|'error'>}
 */
export const promptInstall = async () => {
    const event = promptEvent;
    if (!event || snapshot.status === 'prompting' || snapshot.status === 'installing') {
        return 'unavailable';
    }

    // A prompt event is single-use.
    promptEvent = null;
    window.__pwaPrompt = null;
    setState({ status: 'prompting', canInstall: false });

    try {
        event.prompt();
        const { outcome } = await event.userChoice;

        if (snapshot.installed) return 'accepted'; // `appinstalled` already won the race

        if (outcome === 'accepted') {
            setState({ status: 'installing' });
            clearTimeout(watchdog);
            watchdog = setTimeout(markInstalled, INSTALL_FALLBACK_MS);
            return 'accepted';
        }

        setState({ status: 'idle' });
        return 'dismissed';
    } catch (err) {
        console.error('Install prompt failed:', err);
        setState({ status: 'idle' });
        return 'error';
    }
};

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

const useInstallPrompt = () => {
    const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    return { ...state, promptInstall };
};

export default useInstallPrompt;