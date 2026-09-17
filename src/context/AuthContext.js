// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { googleLogout } from '@react-oauth/google';

// API URL को Environment Variable से लें
const API_URL = process.env.REACT_APP_API_URL;

// Configure global axios settings
axios.defaults.withCredentials = true;

let isRefreshing = false;
let refreshWaiters = [];
let globalSetAccessToken = null;

const onRefreshSuccess = (newToken) => {
    refreshWaiters.forEach(cb => cb(newToken));
    refreshWaiters = [];
};

const onRefreshFailure = (err) => {
    refreshWaiters.forEach(cb => cb(null, err));
    refreshWaiters = [];
};

// Shared single-flight refresh helper function to prevent race conditions & token rotation reuse alerts
const refreshAccessToken = async () => {
    if (isRefreshing) {
        return new Promise((resolve, reject) => {
            refreshWaiters.push((token, err) => {
                if (err) return reject(err);
                resolve(token);
            });
        });
    }

    isRefreshing = true;
    try {
        const res = await axios.post(`${API_URL}/api/auth/refresh`, {}, { withCredentials: true });
        const newToken = res?.data?.accessToken;
        if (newToken) {
            localStorage.setItem('accessToken', newToken);
            if (globalSetAccessToken) {
                globalSetAccessToken(newToken);
            }
        }
        isRefreshing = false;
        onRefreshSuccess(newToken);
        return newToken;
    } catch (refreshError) {
        isRefreshing = false;
        onRefreshFailure(refreshError);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        localStorage.removeItem('refreshToken');
        if (globalSetAccessToken) {
            globalSetAccessToken(null);
        }
        // Defensive self-heal redirect on refresh failure
        if (window.location.pathname !== '/login') {
            window.location.href = '/login';
        }
        throw refreshError;
    }
};

const parseJwt = (token) => {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
        return null;
    }
};

axios.interceptors.request.use((config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => Promise.reject(error));

axios.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error?.config;
        if (
            error?.response?.status === 401 &&
            originalRequest &&
            !originalRequest.__retry &&
            !String(originalRequest.url || '').includes('/api/auth/refresh') &&
            !String(originalRequest.url || '').includes('/api/auth/google') &&
            !String(originalRequest.url || '').includes('/api/auth/login')
        ) {
            originalRequest.__retry = true;

            try {
                const newToken = await refreshAccessToken();
                if (newToken) {
                    originalRequest.headers.Authorization = `Bearer ${newToken}`;
                }
                return axios(originalRequest);
            } catch (refreshError) {
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }
);

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

    useEffect(() => {
        globalSetAccessToken = setAccessToken;

        // Lightweight keep-alive trigger on app mount / open to slide refresh window
        const keepAliveSession = async () => {
            const storedUser = localStorage.getItem('user');
            const currentAccessToken = localStorage.getItem('accessToken');

            if (storedUser && currentAccessToken) {
                const decodedToken = parseJwt(currentAccessToken);
                const currentTime = Date.now() / 1000; // in seconds
                const expiryThreshold = 120; // 2 minutes before expiry

                // Only refresh if token is expired or close to expiry
                if (!decodedToken || decodedToken.exp < (currentTime + expiryThreshold)) {
                    try {
                        await refreshAccessToken();
                    } catch (e) {
                        // Errors are handled by refreshAccessToken's internal self-heal
                    }
                }
            }
        };
        keepAliveSession();
    }, [API_URL]);

    const login = (userData, newAccessToken, newRefreshToken) => {
        const userWithApproval = { ...userData, isApproved: userData.isApproved || false };
        localStorage.setItem('accessToken', newAccessToken);
        // refreshToken is now stored in HttpOnly cookie by backend, removed from localStorage entirely
        localStorage.setItem('user', JSON.stringify(userWithApproval));
        setAccessToken(newAccessToken);
        setUser(userWithApproval);
    };

    const logout = async () => {
        try {
            await axios.post(`${API_URL}/api/auth/logout`, {}, { withCredentials: true });
        } catch (e) {
            console.error("Logout error:", e);
        }

        // Clear local storage and state
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
