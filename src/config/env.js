/**
 * @file src/config/env.js
 * @description Central configuration file.
 */

const config = {
  API: {
    // Backend runs on port 10000 by default
    BASE_URL: process.env.REACT_APP_API_URL || 'http://localhost:10000',
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

if (process.env.NODE_ENV === 'production' && !process.env.REACT_APP_API_URL) {
  console.error('CRITICAL CONFIG ERROR: REACT_APP_API_URL is not set in production!');
}

export default config;
