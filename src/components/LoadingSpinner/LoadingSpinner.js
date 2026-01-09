// src/components/LoadingSpinner/LoadingSpinner.js
import React from 'react';
import { Sparkles, WifiOff } from 'lucide-react'; // ✅ WifiOff icon add kiya
import './LoadingSpinner.css';

function LoadingSpinner({ message = "Initializing Engine...", type = "default" }) {
  // type can be: "default" (Blue) or "offline" (Red)
  
  const isOffline = type === "offline";

  return (
    <div className={`loader-overlay ${isOffline ? 'overlay-error' : ''}`}>
      <div className="loader-content">
        
        <div className="spinner-wrapper">
          <div className={`spin-ring ring-1 ${isOffline ? 'ring-error' : ''}`}></div>
          <div className={`spin-ring ring-2 ${isOffline ? 'ring-error-2' : ''}`}></div>
          <div className={`spin-ring ring-3 ${isOffline ? 'ring-error-3' : ''}`}></div>
          
          <div className="spinner-center">
            {/* Offline ho to WiFi icon, warna Sparkles */}
            {isOffline ? (
              <WifiOff className="loader-icon error-icon" size={28} />
            ) : (
              <Sparkles className="loader-icon" size={28} />
            )}
          </div>
        </div>

        <h3 className={`loading-text ${isOffline ? 'text-error' : ''}`}>
          {message}
          <span className="dot-anim">.</span>
          <span className="dot-anim">.</span>
          <span className="dot-anim">.</span>
        </h3>
        
      </div>
    </div>
  );
}

export default React.memo(LoadingSpinner);