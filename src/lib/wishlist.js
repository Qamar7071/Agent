// Saved places (a wishlist): kept in this browser only, shared between the pages through an event.
import { useEffect, useState } from 'react';
import { read, write } from './store.js';

const KEY = 'raahi:saved-places:v1';
const EVENT = 'raahi:saved-places';

export const savedPlaces = () => {
  const v = read(KEY, []);
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 12) : [];
};

export function toggleSaved(id) {
  const now = savedPlaces();
  const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
  write(KEY, next);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  return next;
}

export function useSavedPlaces() {
  const [list, setList] = useState(savedPlaces);
  useEffect(() => {
    const on = () => setList(savedPlaces());
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);           // another tab
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener('storage', on);
    };
  }, []);
  return list;
}
