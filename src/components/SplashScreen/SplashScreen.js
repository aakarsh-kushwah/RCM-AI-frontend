import React, { useEffect, useState } from 'react';
import './SplashScreen.css';

const SplashScreen = ({ onComplete }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // 🔥 2.3 Seconds ka Hold (Animation complete hone ke liye)
    const timer = setTimeout(() => {
      setIsExiting(true); // Exit Animation Start
      
      // 0.6s Exit transition ke baad parent ko batayein
      setTimeout(() => {
        onComplete(); 
      }, 600); 

    }, 2300); 

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className={`splash-master ${isExiting ? 'splash-exit' : ''}`}>
      
      {/* 🌌 Background Energy Mesh */}
      <div className="energy-mesh"></div>
      <div className="glow-orb top-left"></div>
      <div className="glow-orb bottom-right"></div>

      <div className="splash-center-content">
        
        {/* 🔥 3D LOGO REVEAL */}
        <div className="logo-holo-container">
            <div className="spinning-ring"></div>
            <div className="logo-glass">
                <img 
                    src="https://i.ibb.co/GrMTmd0/Gemini-Generated-Image-q98hyq98hyq98hyq-removebg-preview-removebg-preview.png" 
                    alt="RCM AI" 
                    className="hero-logo"
                />
            </div>
        </div>

        {/* 🚀 BRAND TEXT ANIMATION */}
        <div className="text-content">
            <h1 className="hero-title">
                <span className="slide-up d-1">R</span>
                <span className="slide-up d-2">C</span>
                <span className="slide-up d-3">M</span>
                <span className="spacer"></span>
                <span className="slide-up d-4 highlight">A</span>
                <span className="slide-up d-5 highlight">I</span>
            </h1>
            
            {/* ✨ "Next Generation" Badge */}
            <div className="dev-badge-container">
                <div className="dev-line"></div>
                <p className="dev-text">DEVELOPED BY NEXT GENERATION</p>
                <div className="dev-line"></div>
            </div>
        </div>

        {/* ⏳ High-Speed Laser Loader */}
        <div className="laser-loader">
            <div className="laser-beam"></div>
        </div>

      </div>

      <div className="version-info">
        v2.0 • Enterprise Edition
      </div>
    </div>
  );
};

export default SplashScreen;