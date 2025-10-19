import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css'; 

function LandingPage() {
    // --- State variables ---
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [message, setMessage] = useState('');
    const [language, setLanguage] = useState('hi'); 
    
    // --- PWA State ---
    const [deferredPrompt, setDeferredPrompt] = useState(null); 
    const [isInstallPopupVisible, setIsInstallPopupVisible] = useState(false); 

    // --- Translations (defined as before) ---
    const translations = {
        en: {
             launchingSoon: "Launching Soon",
             subtitle: "The official AI assistant for your RCM Business...",
             namePlaceholder: "Enter your name",
             phonePlaceholder: "Enter your WhatsApp number",
             submitButton: "Get Launch Updates",
             installApp: "Install App",
             aiAssistantTitle: "AI Assistant",
             gurukulTitle: "Gurukul Education",
             cataloguesTitle: "Product Catalogues",
             biographiesTitle: "Leader Biographies",
             webinarTitle: "Webinar Hub",
        },
        hi: {
             launchingSoon: "जल्द ही लॉन्च हो रहा है",
             subtitle: "आपके RCM बिजनेस का ऑफिशियल AI असिस्टेंट...",
             namePlaceholder: "अपना नाम दर्ज करें",
             phonePlaceholder: "अपना व्हाट्सएप नंबर दर्ज करें",
             submitButton: "लॉन्च अपडेट्स पाएं",
             installApp: "ऐप इंस्टॉल करें",
             aiAssistantTitle: "AI असिस्टेंट",
             gurukulTitle: "गुरुकुल शिक्षा",
             cataloguesTitle: "प्रोडक्ट कैटलॉग",
             biographiesTitle: "लीडर बायोग्राफी",
             webinarTitle: "वेबिनार हब",
        }
    };
    const t = translations[language];


    // =======================================================
    // PWA & PARTICLE JS LOGIC
    // =======================================================

    // PWA Logic: Detect install prompt and manage persistence
    useEffect(() => {
        const handleBeforeInstallPrompt = (e) => {
            e.preventDefault(); 
            setDeferredPrompt(e); 
            
            // Only show the custom popup if the app hasn't been installed ('true')
            if (localStorage.getItem('pwa_installed_dismissed') !== 'true') { 
                setIsInstallPopupVisible(true);
            }
        };
        
        const handleAppInstalled = () => {
            setIsInstallPopupVisible(false);
            setDeferredPrompt(null);
            localStorage.setItem('pwa_installed_dismissed', 'true');
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);
        
        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const handleInstallClick = () => {
        if (deferredPrompt) {
            setIsInstallPopupVisible(false); 
            deferredPrompt.prompt(); 
            
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome !== 'accepted') {
                    localStorage.setItem('pwa_installed_dismissed', 'maybe'); 
                }
                setDeferredPrompt(null);
            });
        }
    };
    
    const handleDismissPrompt = () => {
        setIsInstallPopupVisible(false);
        localStorage.setItem('pwa_installed_dismissed', 'maybe'); 
    };

    // Particle JS Initialization (Retained)
    useEffect(() => {
        if (window.particlesJS) {
            // ... (Particle JS initialization logic) ...
            window.particlesJS('particles-js', {
                 "particles": { "number": { "value": 60, "density": { "enable": true, "value_area": 800 } }, "color": { "value": "#ffffff" }, "shape": { "type": "circle" }, "opacity": { "value": 0.5, "random": true }, "size": { "value": 3, "random": true }, "line_linked": { "enable": true, "distance": 150, "color": "#ffffff", "opacity": 0.2, "width": 1 }, "move": { "enable": true, "speed": 1, "direction": "none", "out_mode": "out" } },
                 "interactivity": { "events": { "onhover": { "enable": true, "mode": "repulse" }, "onclick": { "enable": true, "mode": "push" } } }
            });
        }
    }, []);


    // --- Form Submission Handler (Subscribers) ---
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
    // RENDER UI (Matching the desired structure)
    // =======================================================

    return (
        <div className="AppBody">
            <div id="particles-js"></div>
            <div className="container">
                <div className="hero-section">
                    
                    {/* Top Left Logo (Retained from original desired UI) */}
                    <div className="top-left-logo">
                         <img src="https://i.ibb.co/jZvQqHt6/rcm-world-logo-removebg-preview.png" alt="RCM World Logo" />
                    </div>

                    {/* Top Right Login Link */}
                    <Link to="/login" className="top-right-login-link">
                         <button className="login-button">Login</button>
                    </Link>


                    <div className="lang-switcher">
                        <span onClick={() => setLanguage('en')} className={language === 'en' ? 'active' : ''}>EN</span> |
                        <span onClick={() => setLanguage('hi')} className={language === 'hi' ? 'active' : ''}>HI</span>
                    </div>
                    
                    {/* Center Logo/Content */}
                    <div className="center-logo">
                         <img src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" alt="RCM AI Logo" />
                    </div>

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

                {/* Features Grid (Retained desired UI structure) */}
                <div className="features-grid">
                    {/* Feature Card Structure (Use your existing SVG icons/content) */}
                    <div className="feature-card">
                        <div className="feature-icon">🤖</div>
                        <h3>{t.aiAssistantTitle}</h3>
                        <p>{t.aiAssistantDesc}</p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon">🎓</div>
                        <h3>{t.gurukulTitle}</h3>
                        <p>{t.gurukulDesc}</p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon">🛍️</div>
                        <h3>{t.cataloguesTitle}</h3>
                        <p>{t.cataloguesDesc}</p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon">👤</div>
                        <h3>{t.biographiesTitle}</h3>
                        <p>{t.biographiesDesc}</p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon">📺</div>
                        <h3>{t.webinarTitle}</h3>
                        <p>{t.webinarDesc}</p>
                    </div>
                </div>
            </div>

            {/* PWA INSTALL POPUP (Conditional Rendering) */}
            {isInstallPopupVisible && deferredPrompt && (
                <div id="install-popup">
                    <button id="close-popup-button" onClick={handleDismissPrompt}>&times;</button>
                    {/* NOTE: PWA logos must be relative to the public folder */}
                    <img src="%PUBLIC_URL%/logo192.png" alt="RCM AI Logo" style={{width: '30px', height: '30px'}} /> 
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