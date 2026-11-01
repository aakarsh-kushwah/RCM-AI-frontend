const TOKEN_KEY = 'rcm_lifelines_token';

export const getLifelinesToken = () => localStorage.getItem(TOKEN_KEY);
export const setLifelinesToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearLifelinesToken = () => localStorage.removeItem(TOKEN_KEY);

/** apiBase must already end with /api. Throws Error with .status and .data on failure. */
export function createLifelinesApi(apiBase, { onUnauthorized } = {}) {
  const base = `${apiBase}/lifelines`;

  async function request(path, { method = 'GET', body, signal } = {}) {
    const headers = { Accept: 'application/json' };
    const token = getLifelinesToken();
    if (token) headers['x-lifelines-token'] = token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal
    });

    let json = null;
    try { json = await res.json(); } catch { json = null; }

    if (res.status === 401 && json?.code === 'LIFELINES_AUTH_REQUIRED') {
      clearLifelinesToken();
      if (onUnauthorized) onUnauthorized();
    }

    if (!res.ok) {
      const err = new Error(json?.message || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = json;
      throw err;
    }
    return json;
  }

  return {
    get: (path, opts) => request(path, opts),
    post: (path, body, opts) => request(path, { ...opts, method: 'POST', body })
  };
}
