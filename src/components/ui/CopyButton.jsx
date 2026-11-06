// Copy some text to the clipboard and confirm it, with a fallback for older browsers.
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from '../../lib/toast.js';

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export default function CopyButton({ text, label = 'Copy', done = 'Copied', confirm = 'Copied to the clipboard.', className = 'btn-outline', iconSize = 16 }) {
  const [copied, setCopied] = useState(false);
  const run = async () => {
    const value = typeof text === 'function' ? text() : text;
    const ok = await copyText(value);
    if (ok) {
      setCopied(true);
      toast(confirm);
      setTimeout(() => setCopied(false), 2200);
    } else {
      toast({ text: 'Couldn’t copy here. Select the text and copy it yourself.', tone: 'info' });
    }
  };
  return (
    <button type="button" onClick={run} className={className}>
      {copied ? <Check size={iconSize} aria-hidden="true" /> : <Copy size={iconSize} aria-hidden="true" />}
      {copied ? done : label}
    </button>
  );
}
