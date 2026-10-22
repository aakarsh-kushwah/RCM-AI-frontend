import React from 'react';
import './InstallAppBanner.css';

const InstallAppBanner = ({ onInstall, onDismiss }) => {
  return (
    <div className="install-app-banner">
      <div className="banner-content">
        <img src="/teamdekhologo.png" alt="TeamDekho Logo" className="app-logo" />
        <p className="banner-text">Install TeamDekho for a better experience!</p>
      </div>
      <div className="banner-actions">
        <button onClick={onInstall} className="install-button">Install</button>
        <button onClick={onDismiss} className="dismiss-button">No Thanks</button>
      </div>
    </div>
  );
};

export default InstallAppBanner;