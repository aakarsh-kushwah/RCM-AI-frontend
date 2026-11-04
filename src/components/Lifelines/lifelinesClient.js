import axios from 'axios';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'rcm_lifelines_token';
const rawBase = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const API_BASE = rawBase.endsWith('/api') ? rawBase : `${rawBase.replace(/\/+$/, '')}/api`;

const DEFAULT_TIMEOUT_MS = 30000;
const SYNC_TIMEOUT_MS = 60000;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 400;
const RETRY_MAX_MS = 4000;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

// Backend route paths in one place. If your routes file differs, change only here.
const PATHS = {
  sync: '/sync',
  logout: '/logout',
  syncStatus: '/sync-status',
  overview: '/overview',
  children: '/children',
  assistantQuery: '/assistant-query',
  newJoinings: '/new-joinings',
  member: '/member',
  search: '/search',
  territory: '/territory',
  followup: '/followup',
  turnoverHistory: '/turnover-history',
  photo: '/photo'
};

export const UNAUTHORIZED_EVENT = 'lifelines:unauthorized';

// ---------------------------------------------------------------------------
// Token storage (safe even if localStorage is blocked, e.g. private mode)
// ---------------------------------------------------------------------------
export const getLifelinesToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
};
export const setLifelinesToken = (token) => {
  try { if (token) localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* ignore */ }
};
export const clearLifelinesToken = () => {
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
};

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------
export const api = axios.create({
  baseURL: `${API_BASE}/lifelines`,
  timeout: DEFAULT_TIMEOUT_MS,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
  const token = getLifelinesToken();
  if (token) config.headers['x-lifelines-token'] = token;
  return config;
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Exponential backoff with full jitter; honours the Retry-After header when present. */
function backoffDelay(attempt, error) {
  const retryAfter = Number(error?.response?.headers?.['retry-after']);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 10000);
  }
  const ceiling = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt);
  return Math.floor(Math.random() * ceiling);
}

function isRetryable(error) {
  const cfg = error.config;
  if (!cfg || cfg.__noRetry) return false;
  if (axios.isCancel(error)) return false;
  if (String(cfg.method || 'get').toLowerCase() !== 'get') return false; // never replay writes
  if (!error.response) return true; // network error / timeout
  return RETRYABLE_STATUS.has(error.response.status);
}

/** One uniform error shape for the whole UI: .status .code .data .isNetwork .isCanceled */
function normalizeError(error) {
  if (error?.isLifelinesError) return error;
  const status = error?.response?.status || 0;
  const data = error?.response?.data || null;
  const canceled = axios.isCancel(error);
  const message = canceled
    ? 'Request cancelled'
    : data?.message
      || (!error?.response ? 'Network problem. Please check your connection.' : `Request failed (${status})`);

  const err = new Error(message);
  err.isLifelinesError = true;
  err.status = status;
  err.code = data?.code || null;
  err.data = data;
  err.isNetwork = !error?.response && !canceled;
  err.isCanceled = canceled;
  return err;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const data = error?.response?.data;

    // Expired / missing session: clear token and tell the app once.
    const authLost = status === 401
      && !error.config?.__skipAuthRedirect
      && (data?.code === 'LIFELINES_AUTH_REQUIRED' || /session expired/i.test(data?.message || ''));
    if (authLost) {
      clearLifelinesToken();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      throw normalizeError(error);
    }

    // Safe automatic retry for idempotent GETs.
    if (isRetryable(error)) {
      const cfg = error.config;
      cfg.__retryCount = (cfg.__retryCount || 0) + 1;
      if (cfg.__retryCount <= MAX_RETRIES) {
        await sleep(backoffDelay(cfg.__retryCount, error));
        return api.request(cfg);
      }
    }

    throw normalizeError(error);
  }
);

// ---------------------------------------------------------------------------
// In-flight GET de-duplication: identical simultaneous requests share one call.
// (Skipped when the caller passes an AbortSignal, so cancellation stays per caller.)
// ---------------------------------------------------------------------------
const inflight = new Map();

function get(path, { params, signal, noRetry } = {}) {
  const run = () => api.get(path, { params, signal, __noRetry: noRetry }).then((r) => r.data);
  if (signal) return run();

  const key = `${path}|${JSON.stringify(params || {})}|${getLifelinesToken() || ''}`;
  const hit = inflight.get(key);
  if (hit) return hit;

  const promise = run().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

const enc = encodeURIComponent;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
/** Logs in to RCM through the backend. Stores the lifelines token on success. */
export async function syncLifelines(buyerId, password, opts = {}) {
  const res = await api.post(
    PATHS.sync,
    { buyerId, password },
    { timeout: SYNC_TIMEOUT_MS, __noRetry: true, __skipAuthRedirect: true, signal: opts.signal }
  );
  const json = res.data;
  const token = json?.lifelinesToken || json?.token;
  if (json?.success && token) setLifelinesToken(token);
  return json;
}

export async function logoutLifelines() {
  try {
    await api.post(PATHS.logout, {}, { __noRetry: true, __skipAuthRedirect: true });
  } finally {
    clearLifelinesToken();
  }
  return { success: true };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export const getLifelinesOverview = (buyerId, opts) =>
  get(`${PATHS.overview}/${enc(buyerId)}`, opts);

export const getSyncStatus = (buyerId, opts) =>
  get(`${PATHS.syncStatus}/${enc(buyerId)}`, { ...opts, noRetry: true });

export const getAssistantQuery = (buyerId, query = 'all', monthKey = '', opts) =>
  get(PATHS.assistantQuery, { ...opts, params: { buyerId, query, monthKey } });

export const getNewJoinings = (buyerId, { months = 3, monthKey = '', limit } = {}, opts) =>
  get(`${PATHS.newJoinings}/${enc(buyerId)}`, {
    ...opts,
    params: { months, ...(monthKey ? { monthKey } : {}), ...(limit ? { limit } : {}) }
  });

export const getTreeChildren = (buyerId, parentId, opts) =>
  get(`${PATHS.children}/${enc(buyerId)}`, { ...opts, params: { parentId } });

export const getMemberProfile = (rootBuyerId, memberId, opts) =>
  get(`${PATHS.member}/${enc(memberId)}`, { ...opts, params: { rootBuyerId } });

export const searchLifelines = (rootBuyerId, q, limit = 20, opts) =>
  get(PATHS.search, { ...opts, params: { rootBuyerId, q, limit } });

export const getTerritorySummary = (buyerId, opts) =>
  get(`${PATHS.territory}/${enc(buyerId)}`, opts);

export const getFollowupList = (buyerId, opts) =>
  get(`${PATHS.followup}/${enc(buyerId)}`, opts);

export const getTurnoverHistory = (buyerId, opts) =>
  get(PATHS.turnoverHistory, { ...opts, params: { buyerId } });

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
export const updateCustomPhoto = (buyerId, photoUrl) =>
  api.post(PATHS.photo, { buyerId, custom_photo_url: photoUrl }, { __noRetry: true }).then((r) => r.data);

export default api;