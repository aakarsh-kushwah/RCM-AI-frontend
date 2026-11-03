/**
 * @file lifelinesApiClient.js
 * @description API client for Lifelines backend. Auto-injects x-lifelines-token if available.
 */

const rawApi = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
// Normalize: ensure it points to the API root without trailing slash
const API_BASE = rawApi.endsWith('/api') ? rawApi : `${rawApi.replace(/\/+$/, '')}/api`;

const TOKEN_KEY = 'lifelines_token';
const getToken = () => localStorage.getItem(TOKEN_KEY) || localStorage.getItem('rcm_lifelines_token');
const setToken = (token) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem('rcm_lifelines_token', token);
};
const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('rcm_lifelines_token');
};

const getLifelinesToken = getToken;
const setLifelinesToken = setToken;
const clearLifelinesToken = clearToken;

/**
 * Creates an instance of the Lifelines API client with configurable onUnauthorized handler.
 */
function createLifelinesApi(baseUrl = API_BASE, { onUnauthorized } = {}) {
  // Mount target: endpoints can be accessed at /lifelines or /api/lifelines
  const base = baseUrl.replace(/\/+$/, '');
  const prefix = base.endsWith('/lifelines') ? base : `${base}/lifelines`;

  async function request(path, options = {}) {
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (token) {
      headers['x-lifelines-token'] = token;
      headers['Authorization'] = `Bearer ${token}`;
    }

    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${prefix}${cleanPath}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      const isJson = response.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        if (response.status === 401) {
          clearToken();
          if (typeof onUnauthorized === 'function') {
            onUnauthorized();
          }
        }
        const err = new Error(data?.message || response.statusText || 'Request failed');
        err.status = response.status;
        err.data = data;
        throw err;
      }

      return data;
    } catch (error) {
      if (error.status === 401 && typeof onUnauthorized === 'function') {
        onUnauthorized();
      }
      throw error;
    }
  }

  return {
    get: (path, options = {}) => request(path, { method: 'GET', ...options }),
    post: (path, body, options = {}) => request(path, {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      ...options
    }),
    put: (path, body, options = {}) => request(path, {
      method: 'PUT',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      ...options
    }),
    delete: (path, options = {}) => request(path, { method: 'DELETE', ...options })
  };
}

const defaultApi = createLifelinesApi();

const syncLifelines = async (buyerId, password) => {
  const response = await defaultApi.post('/sync', { buyerId, password });
  const token = response.lifelinesToken || response.token;
  if (response.success && token) {
    setToken(token);
  }
  return response;
};

const logoutLifelines = async () => {
  try {
    const res = await defaultApi.post('/logout', {});
    return res;
  } finally {
    clearToken();
  }
};

const getLifelinesOverview = (buyerId) => defaultApi.get(`/overview/${buyerId}`);
const getTreeChildren = (buyerId, parentId) => defaultApi.get(`/tree-children?buyerId=${buyerId}&parentId=${parentId}`);
const getMemberFullProfile = (buyerId, memberId) => defaultApi.get(`/member/${memberId}?rootBuyerId=${buyerId}`);
const getAssistantQuery = (buyerId, query, monthKey) => defaultApi.get(`/assistant-query?buyerId=${buyerId}&q=${encodeURIComponent(query || 'all')}${monthKey ? `&monthKey=${monthKey}` : ''}`);
const getSyncStatus = (buyerId) => defaultApi.get(`/status/${buyerId}`);
const searchLifelines = (rootBuyerId, searchQuery, limit = 20) => defaultApi.get(`/search?rootBuyerId=${rootBuyerId}&q=${encodeURIComponent(searchQuery)}&limit=${limit}`);
const updateCustomPhoto = (buyerId, customPhotoUrl) => defaultApi.post('/photo', { buyerId, custom_photo_url: customPhotoUrl });

export {
  createLifelinesApi,
  getLifelinesToken,
  setLifelinesToken,
  clearLifelinesToken,
  getToken,
  setToken,
  clearToken,
  syncLifelines,
  logoutLifelines,
  getLifelinesOverview,
  getTreeChildren,
  getMemberFullProfile,
  getAssistantQuery,
  getSyncStatus,
  searchLifelines,
  updateCustomPhoto,
  API_BASE
};

export default defaultApi;
