
import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { googleLogout } from '@react-oauth/google';

// API URL को Environment Variable से लें
const API_URL = process.env.REACT_APP_API_URL;

// Configure global axios settings
axios.defaults.withCredentials = true;

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

const parseJwt = (token) => {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
        return null;
    }
};

axios.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('accessToken');
    if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => Promise.reject(error));

axios.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        const isAuthError = error.response && (error.response.status === 401 || (error.response.status === 403 && (error.response.data?.message?.includes("expired") || error.response.data?.err === "jwt expired")));

        if (isAuthError && !originalRequest._retry) {
            if (originalRequest.url.includes("/api/auth/refresh")) {
                // Refresh itself failed; only clear tokens if refresh token is genuinely invalid
                localStorage.removeItem('auth_token');
                localStorage.removeItem('accessToken');
                localStorage.removeItem('user');
                // Redirect to login if refresh fails
                if (window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
                return Promise.reject(error);
            }

            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then((token) => {
                    originalRequest.headers["Authorization"] = `Bearer ${token}`;
                    return axios(originalRequest);
                }).catch(err => Promise.reject(err));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const res = await axios.post(`${API_URL}/api/auth/refresh`);
                const newAccessToken = res.data?.accessToken || res.data?.token;

                if (newAccessToken) {
                    localStorage.setItem("accessToken", newAccessToken);
                    localStorage.setItem("auth_token", newAccessToken);
                    axios.defaults.headers.common["Authorization"] = `Bearer ${newAccessToken}`;
                    originalRequest.headers["Authorization"] = `Bearer ${newAccessToken}`;
                    processQueue(null, newAccessToken);
                    return axios(originalRequest);
                } else {
                    processQueue(new Error("Refresh token failed to provide new access token"), null);
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('accessToken');
                    localStorage.removeItem('user');
                    if (window.location.pathname !== '/login') {
                        window.location.href = '/login';
                    }
                    return Promise.reject(error);
                }
            } catch (refreshErr) {
                processQueue(refreshErr, null);
                localStorage.removeItem('auth_token');
                localStorage.removeItem('accessToken');
                localStorage.removeItem('user');
                if (window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
                return Promise.reject(refreshErr);
            } finally {
                isRefreshing = false;
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
                        await axios.post(`${API_URL}/api/auth/refresh`);
                    } catch (e) {
                        // Errors are handled by the interceptor's internal self-heal and redirect
                    }
                }
            }
        };
        keepAliveSession();
    }, [API_URL]);

    const login = (userData, newAccessToken, newRefreshToken) => {
        const userWithApproval = { ...userData, isApproved: userData.isApproved || false };
        localStorage.setItem('auth_token', newAccessToken);
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
