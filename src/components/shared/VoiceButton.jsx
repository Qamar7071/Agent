// Speak instead of typing. Uses the browser's own speech recognition (in Chrome it sends the
// audio to Google's speech service, and the button says so). Hidden where the browser has none.
// The words go into the box for the person to check; nothing is sent by itself.
import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { read } from '../../lib/store.js';

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export default function VoiceButton({ value = '', onText, disabled = false }) {
  const [on, setOn] = useState(false);
  const [error, setError] = useState(null);
  const rec = useRef(null);
  useEffect(() => () => rec.current?.abort(), []);
  if (!Recognition) return null;

  const start = () => {
    setError(null);
    const r = new Recognition();
    r.lang = read('raahi:lang', 'en') === 'ur' ? 'ur-PK' : 'en-PK';
    r.interimResults = true;
    r.maxAlternatives = 1;
    let base = null;
    const before = String(value || '').trim();              // keep what was already typed
    r.onresult = (e) => {
      const said = Array.from(e.results).map((x) => x[0].transcript).join(' ').trim();
      base = before ? `${before} ${said}` : said;
      onText(base, false);
    };
    r.onerror = (e) => {
      setError(e.error === 'not-allowed' ? 'Microphone permission was refused.' : e.error === 'no-speech' ? 'No speech heard. Try again.' : 'Speech input stopped.');
      setOn(false);
    };
    r.onend = () => {
      setOn(false);
      if (base) onText(base, true);
    };
    rec.current = r;
    r.start();
    setOn(true);
  };
  const stop = () => rec.current?.stop();

  return (
    <div className="relative shrink-0">
      <button type="button" disabled={disabled} onClick={on ? stop : start} aria-pressed={on}
        aria-label={on ? 'Stop listening' : 'Speak instead of typing'}
        title="Speak instead of typing. Your browser's speech service turns it into text (in Chrome, Google's)."
        className={`btn h-[52px] w-[52px] px-0 ${on ? 'bg-brick text-white hover:bg-brick' : 'border border-limestone-400 text-ink hover:bg-limestone'}`}>
        {on ? <MicOff size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
      </button>
      {(on || error) && (
        <p className="absolute bottom-full right-0 mb-2 w-60 rounded-md bg-ink px-3 py-2 text-xs text-paper shadow-lg" role="status">
          {on ? 'Listening… Your browser’s speech service turns this into text. Check it before sending.' : error}
        </p>
      )}
    </div>
  );
}
