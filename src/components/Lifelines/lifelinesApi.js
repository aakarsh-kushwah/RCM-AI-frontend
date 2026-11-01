import axios from 'axios';

const TOKEN_KEY = 'rcm_lifelines_token';
const rawBase = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const API_BASE = rawBase.endsWith('/api') ? rawBase : `${rawBase.replace(/\/+$/, '')}/api`;

export const getLifelinesToken = () => localStorage.getItem(TOKEN_KEY);
export const setLifelinesToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
};
export const clearLifelinesToken = () => localStorage.removeItem(TOKEN_KEY);

// Pre-configured Axios instance with BaseURL
export const api = axios.create({
  baseURL: `${API_BASE}/lifelines`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request Interceptor: Automatically attach x-lifelines-token
api.interceptors.request.use(
  (config) => {
    const token = getLifelinesToken();
    if (token) {
      config.headers['x-lifelines-token'] = token;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Auto-logout on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 && 
      (error.response?.data?.code === 'LIFELINES_AUTH_REQUIRED' || error.response?.data?.message?.includes('Session expired'))
    ) {
      clearLifelinesToken();
      window.dispatchEvent(new Event('lifelines:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export default api;