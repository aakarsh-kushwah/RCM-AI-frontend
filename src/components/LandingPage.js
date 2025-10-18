import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom'; // ✅ Import Link for routing
import './LandingPage.css'; 

// NOTE: This component assumes PWA files (manifest.json, service-worker.js) are correctly set up 
// in the public directory and the sw-register.js script is included in index.html.

function LandingPage() {
    // --- State variables for form, messages, and language ---
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [message, setMessage] = useState('');
    const [language, setLanguage] = useState('hi');
    
    // --- State for PWA install prompt ---
    const [deferredPrompt, setDeferredPrompt] = useState(null); // Stores the event object
    const [isInstallPopupVisible, setIsInstallPopupVisible] = useState(false); // Controls custom popup visibility

    // --- Translations (defined as before) ---
    const translations = {
        // ... (Your existing translations remain here) ...
        en: {
             // ... existing keys ...
             installApp: "Install App",
        },
        hi: {
             // ... existing keys ...
             installApp: "ऐप इंस्टॉल करें",
        }
    };
    const t = translations[language];


    // =======================================================
    // PWA INSTALL LOGIC (FIXED)
    // =======================================================

    useEffect(() => {
        const handleBeforeInstallPrompt = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            
            // FIX: Only show the custom popup if the app hasn't been installed or dismissed yet
            if (!localStorage.getItem('pwa_installed_dismissed')) {
                setIsInstallPopupVisible(true);
            }
        };

        const handleAppInstalled = () => {
            // Once installed, hide the prompt forever
            setIsInstallPopupVisible(false);
            setDeferredPrompt(null);
            localStorage.setItem('pwa_installed_dismissed', 'true');
        };

        // Add event listeners
        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);
        
        // Cleanup function
        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);
    
    const handleInstallClick = () => {
        if (deferredPrompt) {
            // Hide custom UI and show the browser's native prompt
            setIsInstallPopupVisible(false);
            deferredPrompt.prompt();
            
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome !== 'accepted') {
                    // If dismissed, mark it so we don't show the custom popup again for a while
                    localStorage.setItem('pwa_installed_dismissed', 'maybe'); 
                }
                setDeferredPrompt(null);
            });
        }
    };

    const handleDismissPrompt = () => {
        setIsInstallPopupVisible(false);
        // Mark as dismissed so it doesn't appear on every immediate refresh
        localStorage.setItem('pwa_installed_dismissed', 'maybe'); 
    };
    
    // Particle JS Initialization (Remains the same)
    useEffect(() => {
        if (window.particlesJS) {
            window.particlesJS('particles-js', {
                "particles": { "number": { "value": 60, "density": { "enable": true, "value_area": 800 } }, "color": { "value": "#ffffff" }, "shape": { "type": "circle" }, "opacity": { "value": 0.5, "random": true }, "size": { "value": 3, "random": true }, "line_linked": { "enable": true, "distance": 150, "color": "#ffffff", "opacity": 0.2, "width": 1 }, "move": { "enable": true, "speed": 1, "direction": "none", "out_mode": "out" } },
                "interactivity": { "events": { "onhover": { "enable": true, "mode": "repulse" }, "onclick": { "enable": true, "mode": "push" } } }
            });
        }
    }, []);


    // --- Form Submission Handler (Remains the same) ---
    const handleSubmit = async (event) => {
        event.preventDefault();
        setMessage('Submitting...');
        try {
            const apiUrl = `${process.env.REACT_APP_API_URL}/api/subscribe`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone }),
            });

            const data = await response.json();
            if (data.success) {
                setMessage('Thank you for subscribing!');
                setName('');
                setPhone('');
            } else {
                setMessage(data.message || 'Something went wrong.');
            }
        } catch (error) {
            console.error('Submission error:', error);
            setMessage('Failed to connect to the server.');
        }
    };

    // =======================================================
    // RENDER UI
    // =======================================================

    return (
        <div className="AppBody">
            <div id="particles-js"></div>
            <div className="container">
                <div className="hero-section">
                    
                    {/* Top Right Login Link */}
                    {/* Add Login link here if needed */}
                    <Link to="/login" className="top-right-login-link">
                        <button className="login-button">Login</button>
                    </Link>


                    <div className="lang-switcher">
                        <span onClick={() => setLanguage('en')} className={language === 'en' ? 'active' : ''}>EN</span> |
                        <span onClick={() => setLanguage('hi')} className={language === 'hi' ? 'active' : ''}>HI</span>
                    </div>
                    {/* ... Rest of Logos and Headings ... */}
                    
                    <h1>RCM <span dangerouslySetInnerHTML={{ __html: 'AI' }} /></h1>
                    <h2 className="tagline">{t.launchingSoon}</h2>
                    <p className="subtitle">{t.subtitle}</p>

                    <form className="signup-form" onSubmit={handleSubmit}>
                        <div className="input-wrapper">
                            <input type="text" placeholder={t.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} required />
                        </div>
                        <div className="input-wrapper">
                            <input type="tel" placeholder={t.phonePlaceholder} value={phone} onChange={(e) => setPhone(e.target.value)} required />
                        </div>
                        <button type="submit">{t.submitButton}</button>
                    </form>
                    {message && <p style={{ marginTop: '15px', color: '#a9c1d9' }}>{message}</p>}
                </div>

                {/* Features Grid (omitted for brevity, assume it's here) */}
                <div className="features-grid">
                    {/* ... (Features content) ... */}
                </div>
            </div>

            {/* PWA INSTALL POPUP (Conditional Rendering) */}
            {isInstallPopupVisible && deferredPrompt && (
                <div id="install-popup">
                    <button id="close-popup-button" onClick={handleDismissPrompt}>&times;</button>
                    <img src="%PUBLIC_URL%/logo192.png" alt="RCM AI Logo" style={{width: '30px', height: '30px'}} /> {/* Example: Use logo from public folder */}
                    <div className="info">
                        <h4>{t.installApp}</h4>
                        <p>Add to your home screen for instant access.</p>
                    </div>
                    <button id="install-popup-button" onClick={handleInstallClick}>
                        {t.installApp}
                    </button>
                </div>
            )}
        </div>
    );
}

export default LandingPage;