/**
 * @file RootRedirector.jsx
 * @description A lightweight component that redirects users based on their
 *              authentication status. Authenticated users go to /dashboard,
 *              unauthenticated users go to /login.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner/LoadingSpinner';

const RootRedirector = () => {
    const { user, loading } = useAuth();

    // While the auth context is still determining the initial session state,
    // show a loading spinner to prevent a flash of incorrect content.
    if (loading) {
        return <LoadingSpinner message="Checking session..." />;
    }

    // If the user is authenticated, send them to the dashboard.
    // Otherwise, send them to the login page.
    return user
        ? <Navigate to="/dashboard" replace />
        : <Navigate to="/login" replace />;
};

export default RootRedirector;