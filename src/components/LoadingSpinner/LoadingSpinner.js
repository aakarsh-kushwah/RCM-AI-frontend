// src/components/LoadingSpinner/LoadingSpinner.js
import React from 'react';
import { WifiOff } from 'lucide-react';
import BrandLogo from '../BrandLogo/BrandLogo';
import './LoadingSpinner.css';

/**
 * Team Dekho loading / offline screen.
 * Same visual language as the login intro: pearl canvas, orbit ring, animated logo.
 *
 * Props (unchanged)
 *  message : text under the logo (trailing dots are added by the animation, so any
 *            "..." you pass is trimmed automatically)
 *  type    : "default" | "offline"  (offline switches the accent to red + shows a WiFi chip)
 */
function LoadingSpinner({ message = 'Initializing Engine', type = 'default' }) {
  const isOffline = type === 'offline';
  const text = String(message || '').replace(/[.\u2026\s]+$/, '');

  return (
    <div
      className={`tdsp ${isOffline ? 'is-offline' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy={!isOffline}
    >
      {/* soft atmosphere: painted once, never re-laid-out */}
      <span className="tdsp-orb tdsp-orb--1" aria-hidden="true" />
      <span className="tdsp-orb tdsp-orb--2" aria-hidden="true" />
      <span className="tdsp-orb tdsp-orb--3" aria-hidden="true" />

      <div className="tdsp-stage">
        <svg className="tdsp-orbit" viewBox="0 0 320 320" aria-hidden="true">
          <defs>
            <linearGradient id="tdspRing" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--tdsp-a)" />
              <stop offset="55%" stopColor="var(--tdsp-b)" />
              <stop offset="100%" stopColor="var(--tdsp-c)" />
            </linearGradient>
          </defs>
          <circle className="tdsp-track" cx="160" cy="160" r="140" />
          <g className="tdsp-spin">
            <circle className="tdsp-arc" cx="160" cy="160" r="140" />
            <circle className="tdsp-node tdsp-node--1" cx="160" cy="20" r="5" />
          </g>
          <g className="tdsp-spin tdsp-spin--rev">
            <circle className="tdsp-node tdsp-node--2" cx="281" cy="230" r="4" />
            <circle className="tdsp-node tdsp-node--3" cx="39" cy="230" r="4" />
          </g>
        </svg>

        <div className="tdsp-logo">
          <BrandLogo tagline />
        </div>
      </div>

      <div className="tdsp-msg">
        {isOffline && (
          <span className="tdsp-chip">
            <WifiOff size={15} strokeWidth={2.2} />
            Offline
          </span>
        )}
        <h3 className="tdsp-text">
          {text}
          <span className="tdsp-dots" aria-hidden="true">
            <i>.</i><i>.</i><i>.</i>
          </span>
        </h3>
      </div>

      <span className="tdsp-bar" aria-hidden="true" />
    </div>
  );
}

export default React.memo(LoadingSpinner);