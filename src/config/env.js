/**
 * @file src/config/env.js
 * @description Central configuration file.
 */

const config = {
  API: {
    // Agar .env nahi mila to Localhost, warna Live URL
    BASE_URL: process.env.REACT_APP_API_URL || 'http://localhost:5000',
    TIMEOUT: 10000,
  },
  CONTACT: {
    WHATSAPP_NUMBER: "919343743114",
    START_MSG: "Namaste RCM Assistant, mujhe business plan janna he.",
  },
  AUDIO: {
    DEFAULT_RATE: 1.0, 
    DEFAULT_PITCH: 1.0,
  }
};

export default config;