// Group Room keys on this phone. A member's key is the only way to change their answers, vote or
// find their private needs again, so it never leaves this browser except to Raahi's server.
import { read, write } from '../store.js';

const KEY = 'raahi:groups';
const NEEDS = (code) => `raahi:group-needs:${code}`;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const normaliseCode = (code) => String(code || '').toUpperCase().split('').filter((c) => ALPHABET.includes(c)).join('').slice(0, 8);
export const prettyCode = (code) => (code?.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code || '');
export const groupLink = (code) => `${window.location.origin}/g/${code}`;

export const myGroups = () => read(KEY, []);
export const groupEntry = (code) => myGroups().find((g) => g.code === normaliseCode(code)) || null;

export function rememberGroup(entry) {
  const list = myGroups().filter((g) => g.code !== entry.code);
  write(KEY, [{ ...entry, savedAt: new Date().toISOString() }, ...list].slice(0, 20));
}

export function forgetGroup(code) {
  write(KEY, myGroups().filter((g) => g.code !== normaliseCode(code)));
  write(NEEDS(normaliseCode(code)), null);
}

/** Private needs are kept here so the member can see and change what they shared. */
export const myNeeds = (code) => read(NEEDS(normaliseCode(code)), { codes: [], showName: false });
export const saveMyNeeds = (code, value) => write(NEEDS(normaliseCode(code)), value);
