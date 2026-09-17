import React from 'react';
import { Navigate } from 'react-router-dom';

const UserProtectedRoute = ({ children }) => {
    const token = localStorage.getItem('accessToken');
    const userRole = localStorage.getItem('userRole'); 
    
    // 1. Safe User Parsing (Handle corrupt data)
    let user = null;
    try {
        const storedUser = localStorage.getItem('user');
        if (storedUser && storedUser !== "undefined") {
            user = JSON.parse(storedUser);
        }
    } catch (e) {
        console.error("User Data Error:", e);
        localStorage.clear(); // Clear bad data
    }
    
    // 2. Check Authentication
    if (!token || !user) {
        return <Navigate to="/login" replace />;
    }
    
    // 3. Prevent Admins from accessing User pages
    if (userRole === 'ADMIN') {
        return <Navigate to="/admin/dashboard" replace />;
    }

    // 4. If everything is good, render the page
    return children;
};

export default UserProtectedRoute;