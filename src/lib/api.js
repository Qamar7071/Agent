// Client for Raahi's API (backend/app.py). No keys live here: the server owns them.
// Every failure becomes an ApiError with a message written for the traveller.

const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor({ kind, status = 0, code = '', message, details = null, retryAfter = null }) {
    super(message);
    this.kind = kind; // 'network' | 'timeout' | 'http'
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

async function request(method, path, { body, headers = {}, timeout = 30000, signal } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort('timeout'), timeout);
  const onAbort = () => ctrl.abort('cancel');
  signal?.addEventListener('abort', onAbort);
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    if (ctrl.signal.reason === 'cancel') throw new ApiError({ kind: 'cancelled', message: 'Cancelled.' });
    if (ctrl.signal.reason === 'timeout') {
      throw new ApiError({ kind: 'timeout', message: 'Raahi’s server took too long to answer. Try again.' });
    }
    throw new ApiError({ kind: 'network', message: 'Can’t reach Raahi’s server. Check your connection and try again.' });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = data?.error || {};
    const retryAfter = Number(res.headers.get('Retry-After')) || null;
    let message = err.message;
    if (!message) {
      message = res.status === 404 && !data
        ? 'This part of Raahi isn’t available on the server yet.'
        : `Raahi’s server returned an error (${res.status}).`;
    }
    if (res.status === 429 && retryAfter) message = `Too many requests. Wait ${retryAfter} seconds and try again.`;
    throw new ApiError({ kind: 'http', status: res.status, code: err.code || '', message, details: err.details, retryAfter });
  }
  if (data === null) throw new ApiError({ kind: 'http', status: res.status, message: 'The server sent an empty answer.' });
  return data;
}

const get = (path, opts) => request('GET', path, opts);
const post = (path, body, opts) => request('POST', path, { body, ...opts });

export const api = {
  health: () => get('/api/health', { timeout: 10000 }),
  chat: (payload, opts) => post('/api/chat', payload, { timeout: 70000, ...opts }),
  plan: (tripRequest, opts) => post('/api/plan', tripRequest, opts),
  updatePlan: (tripRequest, changes, opts) => post('/api/plan/update', { request: tripRequest, changes }, opts),
  conditions: (payload, opts) => post('/api/conditions', payload, { timeout: 40000, ...opts }),
  weather: (destination, opts) => get(`/api/weather?destination=${encodeURIComponent(destination)}`, { timeout: 20000, ...opts }),
  alerts: (opts) => get('/api/alerts', { timeout: 30000, ...opts }),

  saveTrip: (title, tripRequest) => post('/api/trips', { title, request: tripRequest }),
  getTrip: (id, token) => get(`/api/trips/${id}`, { headers: { 'X-Trip-Token': token } }),
  updateTrip: (id, token, title, tripRequest) =>
    request('PUT', `/api/trips/${id}`, { body: { title, request: tripRequest }, headers: { 'X-Trip-Token': token } }),
  deleteTrip: (id, token) => request('DELETE', `/api/trips/${id}`, { headers: { 'X-Trip-Token': token } }),

  consent: () => get('/api/enquiries/consent', { timeout: 10000 }),
  sendEnquiry: (payload) => post('/api/enquiries', payload),
  enquiryStatus: (ref, token) => get(`/api/enquiries/${ref}`, { headers: { 'X-Enquiry-Token': token } }),
  withdrawEnquiry: (ref, token) => request('DELETE', `/api/enquiries/${ref}`, { headers: { 'X-Enquiry-Token': token } }),

  adminList: (key, status) =>
    get(`/api/admin/enquiries${status ? `?status=${status}` : ''}`, { headers: { Authorization: `Bearer ${key}` } }),
  adminUpdate: (key, ref, body) =>
    request('PATCH', `/api/admin/enquiries/${ref}`, { body, headers: { Authorization: `Bearer ${key}` } }),
};
