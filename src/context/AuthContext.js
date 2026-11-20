import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { googleLogout } from '@react-oauth/google';

// API URL को Environment Variable से लें
const API_URL = process.env.REACT_APP_API_URL;
const REFRESH_PATH = '/api/auth/refresh';
const REFRESH_EARLY_MS = 60 * 1000; // refresh when < 60s of life is left

// Configure global axios settings
axios.defaults.withCredentials = true;

// Plain instance without interceptors: the refresh call can never loop into itself.
const refreshClient = axios.create({ withCredentials: true, timeout: 15000 });

// ---------------------------------------------------------------- helpers
const getStoredToken = () =>
    localStorage.getItem('auth_token') || localStorage.getItem('accessToken');

const hasSession = () => !!(localStorage.getItem('user') || getStoredToken());

const storeToken = (token) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('accessToken', token);
    // keeps AuthProvider's `token` state in sync with what the interceptor just stored
    window.dispatchEvent(new CustomEvent('auth:token', { detail: token }));
};

// Single place that ends a session (only called when the server really rejected the refresh token).
const endSession = () => {
    ['auth_token', 'accessToken', 'refreshToken', 'user'].forEach((k) => localStorage.removeItem(k));
    window.dispatchEvent(new Event('auth:logout'));
    if (window.location.pathname !== '/login') {
        window.location.href = '/login';
    }
};

const msUntilExpiry = (token) => {
    try {
        const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const { exp } = JSON.parse(atob(b64));
        return exp ? exp * 1000 - Date.now() : Infinity;
    } catch (e) {
        return Infinity;
    }
};

// Only a real "refresh token rejected" answer may log the user out.
// Network errors, timeouts and 5xx must NOT, otherwise a flaky connection signs the user out.
const isAuthRejection = (err) => [401, 403].includes(err?.response?.status);

// Never send our token to (or react to 401s from) third-party domains.
const isApiRequest = (url = '') =>
    !/^https?:\/\//i.test(url) || (!!API_URL && url.startsWith(API_URL));

const isAuthUrl = (url = '') => url.includes('/api/auth/');

// ---------------------------------------------------------------- refresh (single-flight, multi-tab safe)
let refreshPromise = null;

const runRefresh = async (staleToken) => {
    // Another tab may have refreshed while we waited for the lock: reuse its token.
    const current = getStoredToken();
    if (current && current !== staleToken && msUntilExpiry(current) > REFRESH_EARLY_MS) {
        return current;
    }

    const res = await refreshClient.post(`${API_URL}${REFRESH_PATH}`);
    const token = res?.data?.accessToken || res?.data?.token;
    if (!token) throw new Error('Refresh response had no access token');
    storeToken(token);
    return token;
};

export const refreshAccessToken = () => {
    if (!refreshPromise) {
        const stale = getStoredToken();
        const task =
            typeof navigator !== 'undefined' && navigator.locks?.request
                ? navigator.locks.request('rcm-user-refresh', () => runRefresh(stale))
                : runRefresh(stale);
        refreshPromise = task.finally(() => {
            refreshPromise = null;
        });
    }
    return refreshPromise;
};

// Refresh now if the stored token is missing / expired / about to expire (only when a session exists).
const refreshIfNeeded = async () => {
    if (!localStorage.getItem('user')) return;
    const token = getStoredToken();
    if (token && msUntilExpiry(token) >= REFRESH_EARLY_MS) return;
    try {
        await refreshAccessToken();
    } catch (e) {
        if (isAuthRejection(e)) endSession();
    }
};

// ---------------------------------------------------------------- request: attach token, refresh early if needed
axios.interceptors.request.use(
    async (config) => {
        const url = config.url || '';
        if (!isApiRequest(url) || isAuthUrl(url)) return config;

        let token = getStoredToken();

        if (token && msUntilExpiry(token) < REFRESH_EARLY_MS) {
            try {
                token = await refreshAccessToken();
            } catch (e) {
                if (isAuthRejection(e)) {
                    endSession();
                    throw e;
                }
                // network/5xx while refreshing: carry on with the current token, the 401 path will retry
                token = getStoredToken();
            }
        }

        if (token) {
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// ---------------------------------------------------------------- response: on 401 refresh once, retry once
axios.interceptors.response.use(
    (response) => response,
    async (error) => {
        const original = error?.config;
        const status = error?.response?.status;

        if (
            status !== 401 ||
            !original ||
            original._retry ||
            !isApiRequest(original.url || '') ||
            isAuthUrl(original.url || '') ||
            !hasSession() // logged-out visitor hitting a public endpoint: nothing to refresh, don't redirect
        ) {
            return Promise.reject(error);
        }
        original._retry = true;

        try {
            const token = await refreshAccessToken();
            original.headers = original.headers || {};
            original.headers.Authorization = `Bearer ${token}`;
            return axios(original);
        } catch (e) {
            if (isAuthRejection(e)) endSession();
            return Promise.reject(error);
        }
    }
);

// ---------------------------------------------------------------- keep idle / background tabs fresh
if (typeof window !== 'undefined') {
    setInterval(refreshIfNeeded, 60 * 1000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refreshIfNeeded();
    });
    window.addEventListener('online', refreshIfNeeded);
}

// 1. Context बनाएं
const AuthContext = createContext();

// 2. Custom Hook बनाएं और इसे EXPORT करें
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

// 3. Provider Component बनाएं
export const AuthProvider = ({ children }) => {
    const [accessToken, setAccessToken] = useState(localStorage.getItem('accessToken') || null);
    const [user, setUser] = useState(() => {
        try {
            const stored = localStorage.getItem('user');
            return stored ? JSON.parse(stored) : null;
        } catch (err) {
            localStorage.removeItem('user');
            return null;
        }
    });
    const [loading, setLoading] = useState(true);

    // Keep React state in sync with the module-level interceptors above.
    useEffect(() => {
        const onToken = (e) => setAccessToken(e.detail || null);
        const onLogout = () => {
            setAccessToken(null);
            setUser(null);
        };
        window.addEventListener('auth:token', onToken);
        window.addEventListener('auth:logout', onLogout);
        return () => {
            window.removeEventListener('auth:token', onToken);
            window.removeEventListener('auth:logout', onLogout);
        };
    }, []);

    // On app open: slide the 90-day refresh window and restore a missing/expired access token.
    useEffect(() => {
        refreshIfNeeded();
    }, []);

    const fetchUserProfileData = async () => {
        try {
            const response = await axios.get(`${API_URL}/api/user/cart/user-data`);
            const { user_image, pin_data } = response.data.data;
            setUser(prevUser => {
                const updatedUser = { ...prevUser, user_image, pin_data };
                localStorage.setItem('user', JSON.stringify(updatedUser));
                return updatedUser;
            });
        } catch (error) {
            console.error("Failed to fetch user profile data:", error);
            // Optionally handle error, e.g., set default values or show a message
        }
    };

    useEffect(() => {
        if (accessToken && user && !user.user_image) {
            fetchUserProfileData();
        }
    }, [accessToken, user]);

    const login = (userData, newAccessToken, newRefreshToken) => {
        const userWithApproval = { ...userData, isApproved: userData.isApproved || false };
        localStorage.setItem('auth_token', newAccessToken);
        localStorage.setItem('accessToken', newAccessToken);
        // refreshToken is now stored in HttpOnly cookie by backend, removed from localStorage entirely
        localStorage.setItem('user', JSON.stringify(userWithApproval));
        setAccessToken(newAccessToken);
        setUser(userWithApproval);
        fetchUserProfileData(); // Fetch profile data immediately after login
    };

    const logout = async () => {
        try {
            await axios.post(`${API_URL}/api/auth/logout`, {}, { withCredentials: true });
        } catch (e) {
            console.error("Logout error:", e);
        }

        // Clear local storage and state
        localStorage.removeItem('auth_token');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        setAccessToken(null);
        setUser(null);

        // Call googleLogout from @react-oauth/google to clear Google session cache
        try {
            googleLogout();
        } catch (e) {
            console.error("Google logout error:", e);
        }
    };

    useEffect(() => {
        setLoading(false);
    }, [accessToken]);

    const value = {
        token: accessToken,
        accessToken,
        refreshToken: null, // Opaque refresh token kept secure in httpOnly cookie
        user,
        loading,
        login,
        logout,
        API_URL: API_URL
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};