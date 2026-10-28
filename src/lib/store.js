// Browser storage, always wrapped: private windows and blocked storage must never break the app.

export function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function write(key, value) {
  try {
    if (value === undefined || value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readSession(key, fallback) {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeSession(key, value) {
  try {
    if (value === undefined || value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

// Saved trips and enquiries live on the server; this browser keeps only their private keys.
const TRIPS = 'raahi:trips';
const ENQUIRIES = 'raahi:enquiries';

export const savedTrips = () => read(TRIPS, []);
export function rememberTrip(trip) {
  const list = savedTrips().filter((t) => t.id !== trip.id);
  write(TRIPS, [{ ...trip, savedAt: new Date().toISOString() }, ...list].slice(0, 50));
}
export function forgetTrip(id) {
  write(TRIPS, savedTrips().filter((t) => t.id !== id));
}
export const tripKey = (id) => savedTrips().find((t) => t.id === id)?.token || null;

export const savedEnquiries = () => read(ENQUIRIES, []);
export function rememberEnquiry(enquiry) {
  write(ENQUIRIES, [enquiry, ...savedEnquiries().filter((e) => e.reference !== enquiry.reference)].slice(0, 50));
}
export function forgetEnquiry(reference) {
  write(ENQUIRIES, savedEnquiries().filter((e) => e.reference !== reference));
}
