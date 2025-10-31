import React, { useState, useEffect } from 'react';
// 🛑 Link import हटा दिया गया है
import './LandingPage.css'; 

function LandingPage() {
    // --- State variables ---
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [message, setMessage] = useState('');
    const [language, setLanguage] = useState('en'); // ✅ Default language set to English
    
    // --- PWA State ---
    const [deferredPrompt, setDeferredPrompt] = useState(null); 
    const [isInstallPopupVisible, setIsInstallPopupVisible] = useState(false); 

    // ✅ FIX: Use a fallback API URL to ensure details are sent
    const API_BASE = process.env.REACT_APP_API_URL || 'https://rcm-ai-backend.onrender.com';

    // --- Translations ---
    const translations = {
        en: {
             launchingSoon: "Launching Soon",
             subtitle: "The official AI assistant for your RCM Business...",
             namePlaceholder: "Enter your name",
             phonePlaceholder: "Enter your WhatsApp number",
             submitButton: "Get Launch Updates",
             installApp: "Install App",
             aiAssistantTitle: "AI Assistant",
             aiAssistantDesc: "Get instant answers to all your questions...",
             gurukulTitle: "Gurukul Education",
             gurukulDesc: "Gain mentorship and true knowledge...",
             cataloguesTitle: "Product Catalogues",
             cataloguesDesc: "Browse all RCM products easily...",
             biographiesTitle: "Leader Biographies",
             biographiesDesc: "Be inspired by the stories of top RCM leaders.",
             webinarTitle: "Webinar Hub",
             webinarDesc: "Get timely info and direct links for all Zoom sessions.",
        },
        hi: {
             launchingSoon: "जल्द ही लॉन्च हो रहा है",
             subtitle: "आपके RCM बिजनेस का ऑफिशियल AI असिस्टेंट...",
             namePlaceholder: "अपना नाम दर्ज करें",
             phonePlaceholder: "अपना व्हाट्सएप नंबर दर्ज करें",
             submitButton: "लॉन्च अपडेट्स पाएं",
             installApp: "ऐप इंस्टॉल करें",
             aiAssistantTitle: "AI असिस्टेंट",
             aiAssistantDesc: "अपने सभी सवालों के जवाब तुरंत पाएं...",
             gurukulTitle: "गुरुकुल शिक्षा",
             gurukulDesc: "गुरुकुल सिद्धांतों पर आधारित सही ज्ञान पाएं...",
             cataloguesTitle: "प्रोडक्ट कैटलॉग",
             cataloguesDesc: "सभी RCM प्रोडक्ट्स का डिजिटल कैटलॉग एक्सेस करें।",
             biographiesTitle: "लीडर बायोग्राफी",
             biographiesDesc: "शीर्ष लीडर्स की सफलता की कहानियों से प्रेरणा लें।",
             webinarTitle: "वेबिनार हब",
             webinarDesc: "सभी वेबिनार और अपडेट्स की जानकारी एक ही जगह पाएं।",
        }
    };
    const t = translations[language];


    // =======================================================
    // PWA & PARTICLE JS LOGIC
    // =======================================================
    useEffect(() => {
        const handleBeforeInstallPrompt = (e) => {
            e.preventDefault(); 
            setDeferredPrompt(e); 
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
        
        if (window.particlesJS) {
            window.particlesJS('particles-js', {
                 "particles": { "number": { "value": 60, "density": { "enable": true, "value_area": 800 } }, "color": { "value": "#ffffff" }, "shape": { "type": "circle" }, "opacity": { "value": 0.5, "random": true }, "size": { "value": 3, "random": true }, "line_linked": { "enable": true, "distance": 150, "color": "#ffffff", "opacity": 0.2, "width": 1 }, "move": { "enable": true, "speed": 1, "direction": "none", "out_mode": "out" } },
                 "interactivity": { "events": { "onhover": { "enable": true, "mode": "repulse" }, "onclick": { "enable": true, "mode": "push" } } }
            });
        }
        
        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const handleInstallClick = () => {
        if (deferredPrompt) {
            setIsInstallPopupVisible(false); 
            deferredPrompt.prompt(); 
            deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
        }
    };
    
    const handleDismissPrompt = () => {
        setIsInstallPopupVisible(false);
        localStorage.setItem('pwa_installed_dismissed', 'maybe'); 
    };

    // --- Form Submission Handler (Subscribers) ---
    const handleSubmit = async (event) => {
        event.preventDefault();
        setMessage('Submitting...');

        // ✅ FIX: Use the API_BASE constant (which has the fallback)
        const apiUrl = API_BASE; 

        if (!apiUrl) {
            setMessage('Configuration error: API URL is not set.');
            console.error("CRITICAL: API_BASE is missing.");
            return;
        }

        try {
            const response = await fetch(`${apiUrl}/api/subscribe`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Server error occurred.');
            }
            
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
                    
                    <div className="top-left-logo">
                         <img src="https://i.ibb.co/jZvQqHt6/rcm-world-logo-removebg-preview.png" alt="RCM World Logo" />
                    </div>

                    {/* 🛑 LOGIN BUTTON REMOVED as requested */}

                    <div className="lang-switcher">
                        <span onClick={() => setLanguage('en')} className={language === 'en' ? 'active' : ''}>EN</span> |
                        <span onClick={() => setLanguage('hi')} className={language === 'hi' ? 'active' : ''}>HI</span>
                    </div>
                    
                    <div className="center-logo">
                         <img src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" alt="RCM AI Logo" />
                    </div>

                    <h1>RCM <span className="ai-accent">AI</span></h1>
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
                    {message && <p className="response-msg">{message}</p>}
                </div>

                {/* Features Grid */}
                <div className="features-grid">
                    {[
                        ['🤖', t.aiAssistantTitle, t.aiAssistantDesc],
                        ['🎓', t.gurukulTitle, t.gurukulDesc],
                        ['🛍️', t.cataloguesTitle, t.cataloguesDesc],
                        ['👤', t.biographiesTitle, t.biographiesDesc], 
                        ['📺', t.webinarTitle, t.webinarDesc],
                    ].map(([icon, title, desc]) => (
                        <div key={title} className="feature-card">
                            <div className="feature-icon">{icon}</div>
                            <h3>{title}</h3>
                            <p>{desc}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* PWA INSTALL POPUP (Conditional Rendering) */}
            {isInstallPopupVisible && deferredPrompt && (
                <div id="install-popup">
                    <button id="close-popup-button" onClick={handleDismissPrompt}>&times;</button>
                    <img src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" alt="RCM AI Logo" style={{width: '30px', height: '30px'}} /> 
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

