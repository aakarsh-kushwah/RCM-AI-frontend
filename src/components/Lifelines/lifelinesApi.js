import api, { UNAUTHORIZED_EVENT } from './lifelinesApiClient';

/** Backward-compatible wrapper. apiBase is ignored; the shared client already knows it. */
export function createLifelinesApi(apiBase, { onUnauthorized } = {}) {
  if (onUnauthorized) window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  return {
    get: (path, opts = {}) => api.get(path, opts).then((r) => r.data),
    post: (path, body, opts = {}) => api.post(path, body, opts).then((r) => r.data)
  };
}

export {
  getLifelinesToken, setLifelinesToken, clearLifelinesToken
} from './lifelinesApiClient';