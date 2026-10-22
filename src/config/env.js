/**
 * @file src/config/env.js
 * @description Central configuration file with dual-environment auto-detection.
 */

const isLocalhost = Boolean(
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
   window.location.hostname === '127.0.0.1')
);

const resolvedBaseUrl = (
  process.env.REACT_APP_API_URL ||
  (isLocalhost ? 'http://localhost:5000' : 'https://rcm-ai-backend.onrender.com')
).replace(/\/+$/, '');

const config = {
  API: {
    BASE_URL: resolvedBaseUrl,
    TIMEOUT: 10000,
  },
  CONTACT: {
    WHATSAPP_NUMBER: "919343743114",
    START_MSG: "Namaste RCM Assistant.",
  },
  AUDIO: {
    DEFAULT_RATE: 1.0, 
    DEFAULT_PITCH: 1.0,
  }
};

export default config;
