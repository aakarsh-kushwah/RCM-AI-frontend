// Nayi file: src/components/LoadingSpinner.js
import React from 'react';
import './LoadingSpinner.css'; // Hum yeh CSS file abhi banayenge

/**
 * Ek full-page loading spinner component
 */
function LoadingSpinner() {
  return (
    <div className="spinner-overlay">
      <div className="spinner-container"></div>
    </div>
  );
}

export default React.memo(LoadingSpinner); // Memoized for performance