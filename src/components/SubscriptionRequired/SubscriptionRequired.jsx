import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Zap, ShieldCheck, Lock } from 'lucide-react';
import './SubscriptionRequired.css';

const SubscriptionRequired = () => {
    return (
        <div className="subscription-required-container">
            <div className="subscription-card">
                <div className="subscription-badge-top">PRO FEATURE PAYWALL</div>
                <h1 className="subscription-header">Unlock RCM AI Pro</h1>
                <p className="subscription-message">
                    Access to the RCM AI Chatbot and advanced downline tools requires an active subscription.
                </p>

                <div className="trial-pricing-banner">
                    <span className="price-rupee">₹</span>
                    <span className="price-val">5</span>
                    <div className="price-details">
                        <strong>24-Hour Trial / Setup</strong>
                        <span>Followed by ₹49/month recurring autopay</span>
                    </div>
                </div>

                <div className="feature-showcase-grid">
                    <div className="f-item">
                        <CheckCircle size={16} className="f-icon" />
                        <span>Unlimited 24x7 AI Chat Support & Instant Answers</span>
                    </div>
                    <div className="f-item">
                        <CheckCircle size={16} className="f-icon" />
                        <span>RCM A to Z Product Knowledge (PV, BV & Benefits)</span>
                    </div>
                    <div className="f-item">
                        <CheckCircle size={16} className="f-icon" />
                        <span>Rise Health & Health Care Nutrition Guidance</span>
                    </div>
                    <div className="f-item">
                        <CheckCircle size={16} className="f-icon" />
                        <span>Tree Structure Analysis (Track who purchased & who didn't)</span>
                    </div>
                    <div className="f-item">
                        <CheckCircle size={16} className="f-icon" />
                        <span>Diamond Club (5000+ PV) & Pin Achiever Auto-Tracker</span>
                    </div>
                    <div className="f-item">
                        <CheckCircle size={16} className="f-icon" />
                        <span>Active vs Terminate Downline List</span>
                    </div>
                    <div className="f-item">
                        <CheckCircle size={16} className="f-icon" />
                        <span>Auto WhatsApp Congratulations Poster Generator</span>
                    </div>
                    <div className="f-item">
                        <CheckCircle size={16} className="f-icon" />
                        <span>Daily Business Report & Growth Tracking</span>
                    </div>
                    <div className="f-item">
                        <CheckCircle size={16} className="f-icon" />
                        <span>Commission & Target Calculator</span>
                    </div>
                </div>

                <Link to="/payment-setup" className="subscribe-button">
                    Activate Now for ₹5 (24-Hour Trial)
                </Link>

                <div className="razorpay-note">
                    <Lock size={12} /> Powered by Razorpay Secure Payments · Cancel anytime with 1-click
                </div>
            </div>
        </div>
    );
};

export default SubscriptionRequired;
