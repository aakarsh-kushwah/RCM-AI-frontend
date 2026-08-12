import React from 'react';
import { Link } from 'react-router-dom';
import './SubscriptionRequired.css';

const SubscriptionRequired = () => {
    return (
        <div className="subscription-required-container">
            <div className="subscription-card">
                <h1 className="subscription-header">Subscription Required</h1>
                <p className="subscription-message">
                    Access to this feature requires an active RCM AI subscription.
                </p>
                <p className="subscription-cta">
                    Unlock premium utilities and enjoy full access!
                </p>
                <Link to="/payment-setup" className="subscribe-button">
                    Go to Subscription Page
                </Link>
                <p className="razorpay-note">
                    Powered by Razorpay Secure Payments
                </p>
            </div>
        </div>
    );
};

export default SubscriptionRequired;
