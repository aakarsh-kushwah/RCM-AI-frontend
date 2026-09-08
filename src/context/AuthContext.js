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

const onRefreshSuccess = (newToken) => {
    refreshWaiters.forEach(cb => cb(newToken));
    refreshWaiters = [];
};

const onRefreshFailure = (err) => {
    refreshWaiters.forEach(cb => cb(null, err));
    refreshWaiters = [];
};

axios.interceptors.request.use((config) => {
    const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
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

            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    refreshWaiters.push((token, err) => {
                        if (err) return reject(err);
                        if (token) {
                            originalRequest.headers.Authorization = `Bearer ${token}`;
                        }
                        resolve(axios(originalRequest));
                    });
                });
            }

            isRefreshing = true;
            try {
                const res = await axios.post(`${API_URL}/api/auth/refresh`, {}, { withCredentials: true });
                const newToken = res?.data?.accessToken;
                if (newToken) {
                    localStorage.setItem('accessToken', newToken);
                    localStorage.setItem('token', newToken);
                }
                isRefreshing = false;
                onRefreshSuccess(newToken);

                if (newToken) {
                    originalRequest.headers.Authorization = `Bearer ${newToken}`;
                }
                return axios(originalRequest);
            } catch (refreshError) {
                isRefreshing = false;
                onRefreshFailure(refreshError);
                localStorage.removeItem('accessToken');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
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
    const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
    const [loading, setLoading] = useState(true);

    const login = (userData, newAccessToken, newRefreshToken) => {
        const userWithApproval = { ...userData, isApproved: userData.isApproved || false };
        localStorage.setItem('accessToken', newAccessToken);
        localStorage.setItem('token', newAccessToken);
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
        localStorage.removeItem('token');
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
