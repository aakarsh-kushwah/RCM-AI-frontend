import React, { useState, useEffect } from 'react';
import './LandingPage.css'; // Import the component-specific CSS

function LandingPage() {
    // --- State variables for form, messages, and language ---
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [message, setMessage] = useState('');
    const [language, setLanguage] = useState('en');
    
    // --- State for PWA install prompt ---
    const [installPrompt, setInstallPrompt] = useState(null);
    const [isInstallPopupVisible, setIsInstallPopupVisible] = useState(false);

    // --- Effects and other functions remain the same ---
    useEffect(() => {
        if (window.particlesJS) {
            window.particlesJS('particles-js', {
                "particles": { "number": { "value": 60, "density": { "enable": true, "value_area": 800 } }, "color": { "value": "#ffffff" }, "shape": { "type": "circle" }, "opacity": { "value": 0.5, "random": true }, "size": { "value": 3, "random": true }, "line_linked": { "enable": true, "distance": 150, "color": "#ffffff", "opacity": 0.2, "width": 1 }, "move": { "enable": true, "speed": 1, "direction": "none", "out_mode": "out" } },
                "interactivity": { "events": { "onhover": { "enable": true, "mode": "repulse" }, "onclick": { "enable": true, "mode": "push" } } }
            });
        }
    }, []);

    useEffect(() => {
        const handleBeforeInstallPrompt = (e) => {
            e.preventDefault();
            setInstallPrompt(e);
            setIsInstallPopupVisible(true);
        };
        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);
    
    const handleInstallClick = async () => {
        setIsInstallPopupVisible(false);
        if (!installPrompt) return;
        const result = await installPrompt.prompt();
        console.log(`Install prompt outcome: ${result.outcome}`);
        setInstallPrompt(null);
    };

    const translations = {
        en: {
            launchingSoon: "Launching Soon",
            subtitle: "The official AI assistant for your RCM Business. Built on the principles of Gurukul education, it provides instant access to product info, updates, webinars, and leader biographies.",
            namePlaceholder: "Enter your name",
            phonePlaceholder: "Enter your WhatsApp number",
            submitButton: "Get Launch Updates",
            aiAssistantTitle: "AI Assistant",
            aiAssistantDesc: "Get instant answers to all your questions. Ask about products, plans, or updates, and our AI will provide information in seconds.",
            gurukulTitle: "Gurukul Education",
            gurukulDesc: "Our AI provides true knowledge and mentorship for your business growth, based on the core principles of Gurukul education.",
            cataloguesTitle: "Product Catalogues",
            cataloguesDesc: "Access the complete and always updated digital catalogue of all RCM products. Search and find any product with ease.",
            biographiesTitle: "Leader Biographies",
            biographiesDesc: "Get inspired by the journeys of our top leaders. Access their biographies, achievements, and success stories in one place.",
            webinarTitle: "Webinar Hub",
            webinarDesc: "Never miss an update. Get timely information and direct links for all Zoom meetings and Gurukul webinars in one place."
        },
        hi: {
            launchingSoon: "जल्द ही लॉन्च हो रहा है",
            subtitle: "आपके RCM बिजनेस का ऑफिशियल AI असिस्टेंट। गुरुकुल की शिक्षा के सिद्धांतों पर आधारित, यह आपको प्रोडक्ट्स की जानकारी, अपडेट्स, वेबिनार और लीडर्स की बायोग्राफी तक तुरंत पहुंच प्रदान करता है।",
            namePlaceholder: "अपना नाम दर्ज करें",
            phonePlaceholder: "अपना व्हाट्सएप नंबर दर्ज करें",
            submitButton: "लॉन्च अपडेट्स पाएं",
            aiAssistantTitle: "AI असिस्टेंट",
            aiAssistantDesc: "अपने सभी सवालों के जवाब तुरंत पाएं। प्रोडक्ट्स, प्लान्स या अपडेट्स के बारे में पूछें, और हमारा AI सेकंडों में जानकारी देगा।",
            gurukulTitle: "गुरुकुल शिक्षा",
            gurukulDesc: "हमारा AI गुरुकुल शिक्षा के मूल सिद्धांतों पर आधारित, आपके व्यापार के विकास के लिए सच्चा ज्ञान और मार्गदर्शन प्रदान करता है।",
            cataloguesTitle: "प्रोडक्ट कैटलॉग",
            cataloguesDesc: "सभी RCM प्रोडक्ट्स का पूरा और हमेशा अपडेटेड डिजिटल कैटलॉग एक्सेस करें। किसी भी प्रोडक्ट को आसानी से खोजें और पाएं।",
            biographiesTitle: "लीडर बायोग्राफी",
            biographiesDesc: "हमारे शीर्ष लीडर्स की यात्रा से प्रेरणा लें। उनकी बायोग्राफी, उपलब्धियों और सफलता की कहानियों को एक ही स्थान पर एक्सेस करें।",
            webinarTitle: "वेबिनार हब",
            webinarDesc: "कोई भी अपडेट मिस न करें। सभी ज़ूम मीटिंग्स और गुरुकुल वेबिनार की समय पर जानकारी और डायरेक्ट लिंक एक ही स्थान पर प्राप्त करें।"
        }
    };

    // --- Form Submission Handler ---
    const handleSubmit = async (event) => {
        event.preventDefault();
        setMessage('Submitting...');
        try {
            // ✅ **बदलाव यहाँ किया गया है**
            // यह .env.local या Vercel के वेरिएबल से URL उठाएगा
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

    // --- JSX remains the same ---
    return (
        <div className="AppBody">
            <div id="particles-js"></div>
            <div className="container">
                <div className="hero-section">
                    <div className="top-left-logo">
                        <img src="https://i.ibb.co/jZvQqHt6/rcm-world-logo-removebg-preview.png" alt="RCM World Logo" />
                    </div>
                    <div className="lang-switcher">
                        <span onClick={() => setLanguage('en')} className={language === 'en' ? 'active' : ''}>EN</span> |
                        <span onClick={() => setLanguage('hi')} className={language === 'hi' ? 'active' : ''}>HI</span>
                    </div>
                    <div className="center-logo">
                        <img src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" alt="RCM AI Logo" />
                    </div>
                    <h1>RCM <span dangerouslySetInnerHTML={{ __html: 'AI' }} /></h1>
                    <h2 className="tagline">{translations[language].launchingSoon}</h2>
                    <p className="subtitle">{translations[language].subtitle}</p>

                    <form className="signup-form" onSubmit={handleSubmit}>
                         <div className="input-wrapper">
                            <input type="text" placeholder={translations[language].namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} required />
                        </div>
                        <div className="input-wrapper">
                            <input type="tel" placeholder={translations[language].phonePlaceholder} value={phone} onChange={(e) => setPhone(e.target.value)} required />
                        </div>
                        <button type="submit">{translations[language].submitButton}</button>
                    </form>
                    {message && <p style={{ marginTop: '15px', color: '#a9c1d9' }}>{message}</p>}
                </div>

                <div className="features-grid">
                    <div className="feature-card">
                        <div className="feature-icon"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10M18 20V4M6 20v-4"></path></svg></div>
                        <h3>{translations[language].aiAssistantTitle}</h3>
                        <p>{translations[language].aiAssistantDesc}</p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3.33 1.67 6.67 1.67 10 0v-5"></path></svg></div>
                        <h3>{translations[language].gurukulTitle}</h3>
                        <p>{translations[language].gurukulDesc}</p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg></div>
                        <h3>{translations[language].cataloguesTitle}</h3>
                        <p>{translations[language].cataloguesDesc}</p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 23 9"></polyline></svg></div>
                        <h3>{translations[language].biographiesTitle}</h3>
                        <p>{translations[language].biographiesDesc}</p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg></div>
                        <h3>{translations[language].webinarTitle}</h3>
                        <p>{translations[language].webinarDesc}</p>
                    </div>
                </div>
            </div>

            <div id="install-popup" className={isInstallPopupVisible ? 'show' : ''}>
                <button id="close-popup-button" onClick={() => setIsInstallPopupVisible(false)}>&times;</button>
                <img src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" alt="RCM AI Logo" />
                <div className="info">
                    <h4>Install RCM AI</h4>
                    <p>Add to your home screen for a better experience.</p>
                </div>
                <button id="install-popup-button" onClick={handleInstallClick}>Install</button>
            </div>
        </div>
    );
}

export default LandingPage;