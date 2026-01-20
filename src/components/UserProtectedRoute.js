import React from 'react';
import { Navigate } from 'react-router-dom';

const UserProtectedRoute = ({ children }) => {
    const token = localStorage.getItem('token');
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

    // 4. ✅ FIXED: Subscription Status Check
    // Ab hum check kar rahe hain ki agar status na to 'active' hai aur na hi 'premium',
    // tabhi payment page par bhejo.
    if (user.status !== 'active' && user.status !== 'premium') {
        return <Navigate to="/payment-setup" replace />;
    }

    // 5. If everything is good, render the page
    return children;
};

export default UserProtectedRoute;