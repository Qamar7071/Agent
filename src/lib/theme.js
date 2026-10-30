// Light / dark / system theme. The choice is stored in this browser; index.html applies it
// before the first paint. The intelligence pages (Twin, Agents, Guardian) are always dark.
import { useCallback, useEffect, useState } from 'react';
import { read, write } from './store.js';

const KEY = 'raahi:theme';
const ORDER = ['system', 'light', 'dark'];

function apply(choice) {
  const root = document.documentElement;
  if (choice === 'light' || choice === 'dark') root.dataset.theme = choice;
  else delete root.dataset.theme;
}

export function useTheme() {
  const [choice, setChoice] = useState(() => read(KEY, 'system'));
  useEffect(() => apply(choice), [choice]);
  const next = useCallback(() => {
    setChoice((c) => {
      const n = ORDER[(ORDER.indexOf(c) + 1) % ORDER.length];
      write(KEY, n === 'system' ? null : n);
      return n;
    });
  }, []);
  return { choice, next };
}
