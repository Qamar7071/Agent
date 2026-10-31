// The interface language (English or Roman Urdu), shared by the pages that offer the switch.
import { useState } from 'react';
import { read } from './store.js';

export const LANG_KEY = 'raahi:lang';

export function useLang() {
  const [lang, setLangState] = useState(() => read(LANG_KEY, 'en'));
  const setLang = (l) => {
    setLangState(l);
    try { localStorage.setItem(LANG_KEY, JSON.stringify(l)); } catch { /* private mode: keep it for this visit */ }
  };
  return [lang, setLang];
}
