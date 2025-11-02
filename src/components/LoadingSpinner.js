import React from 'react';
import './LoadingSpinner.css'; // हम यह CSS फ़ाइल नीचे बनाएंगे

function LoadingSpinner() {
  return (
    <div className="spinner-overlay">
      <div className="spinner-container"></div>
    </div>
  );
}

export default LoadingSpinner;
