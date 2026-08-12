// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { googleLogout } from '@react-oauth/google';

// API URL को Environment Variable से लें
const API_URL = process.env.REACT_APP_API_URL;

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
    const [refreshToken, setRefreshToken] = useState(localStorage.getItem('refreshToken') || null);
    const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
    const [loading, setLoading] = useState(true);

    const login = (userData, newAccessToken, newRefreshToken) => {
        const userWithApproval = { ...userData, isApproved: userData.isApproved || false };
        localStorage.setItem('accessToken', newAccessToken);
        localStorage.setItem('refreshToken', newRefreshToken);
        localStorage.setItem('user', JSON.stringify(userWithApproval));
        setAccessToken(newAccessToken);
        setRefreshToken(newRefreshToken);
        setUser(userWithApproval);
    };

    const logout = () => {
        // Clear local storage and state
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        setAccessToken(null);
        setRefreshToken(null);
        setUser(null);

        // Call googleLogout from @react-oauth/google to clear Google session cache
        try {
            googleLogout();
        } catch (e) {
            console.error("Google logout error:", e);
        }
    };

    // Axios Header को सेटअप करना
    useEffect(() => {
        if (accessToken) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
        } else {
            delete axios.defaults.headers.common['Authorization'];
        }
        setLoading(false);
    }, [accessToken]); // Dependency updated to accessToken

    const value = {
        accessToken,
        refreshToken,
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
