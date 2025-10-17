import React from 'react';
import { Navigate } from 'react-router-dom';

const UserProtectedRoute = ({ children }) => {
    const token = localStorage.getItem('token');
    const userRole = localStorage.getItem('userRole'); 
    
    // 1. Check Authentication
    if (!token) {
        return <Navigate to="/login" replace />;
    }
    
    // 2. Prevent Admins from accessing User pages
    if (userRole === 'ADMIN') {
        // Redirect Admin to their specific dashboard route
        return <Navigate to="/admin/dashboard" replace />;
    }

    // If authenticated as a regular USER, grant access
    return children;
};

export default UserProtectedRoute;