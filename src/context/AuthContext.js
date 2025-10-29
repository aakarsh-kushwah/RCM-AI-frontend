// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

// API URL को Environment Variable से लें
const API_URL = process.env.REACT_APP_API_URL;

// 1. Context बनाएं
const AuthContext = createContext();

// 2. Custom Hook बनाएं और इसे EXPORT करें (यह 'useAuth' एरर को फिक्स करता है)
export const useAuth = () => {
    // यह चेक करता है कि हुक Provider के अंदर इस्तेमाल हो रहा है या नहीं
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

// 3. Provider Component बनाएं
export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('token') || null);
    const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
    const [loading, setLoading] = useState(true);

    const login = (userData, jwtToken) => {
        localStorage.setItem('token', jwtToken);
        localStorage.setItem('user', JSON.stringify(userData));
        setToken(jwtToken);
        setUser(userData);
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
    };

    // Axios Header को सेटअप करना
    useEffect(() => {
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        } else {
            // टोकन न होने पर Header हटा दें
            delete axios.defaults.headers.common['Authorization'];
        }
        setLoading(false);
    }, [token]);

    const value = {
        token,
        user,
        loading,
        login,
        logout,
        // API_URL को यहाँ से एक्सपोर्ट करें ताकि सभी जगह उपलब्ध हो
        API_URL: API_URL 
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};