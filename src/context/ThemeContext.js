/**
 * @file src/context/ThemeContext.js
 * @description Theme Context - Handles theme state, localStorage persistence,
 *              and synchronous .dark class toggling on document root to eliminate FOUC.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    // Synchronously check localStorage or default to dark mode to prevent FOUC
    const [theme, setTheme] = useState(() => {
        const savedTheme = localStorage.getItem('rcm_ai_theme');
        if (savedTheme) return savedTheme;
        return 'dark'; // Default to dark mode for RCM AI premium interface
    });

    useEffect(() => {
        const root = document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
            root.classList.remove('light');
        } else {
            root.classList.add('light');
            root.classList.remove('dark');
        }
        localStorage.setItem('rcm_ai_theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
