// "Share with family": a read-only link that shows which town the group sleeps in each night.
// It needs the trip saved on Raahi's server; the link's key stays in this browser.
import { useState } from 'react';
import { Check, Copy, HeartHandshake, Link2Off, MessageCircle, Share2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { read, write } from '../../lib/store.js';
import Dialog from '../ui/Dialog.jsx';

const KEY = 'raahi:shares:v1';
const remembered = (tripId) => read(KEY, {})[tripId] || null;
const remember = (tripId, value) => {
  const all = read(KEY, {});
  if (value) all[tripId] = value;
  else delete all[tripId];
  write(KEY, all);
};
export const shareLink = (token) => `${window.location.origin}/s/${token}`;

/** trip: { id, token, title } of a saved trip, or null; ensureTrip(): saves first when needed. */
export default function ShareFamily({ open, onClose, trip, ensureTrip, storageOff = false }) {
  const [current, setCurrent] = useState(() => (trip ? remembered(trip.id) : null));
  const [note, setNote] = useState(current?.note || '');
  const [state, setState] = useState({ busy: false, error: null, copied: false });

  const create = async () => {
    setState({ busy: true, error: null, copied: false });
    try {
      const t = trip?.token ? trip : await ensureTrip?.();
      if (!t?.token) throw new Error('Save the trip first: the link reads it from Raahi’s server.');
      const res = await api.shareCreate(t.id, t.token, note.trim());
      const value = { token: res.token, note: note.trim(), created: new Date().toISOString(), tripId: t.id };
      remember(t.id, value);
      setCurrent(value);
      setState({ busy: false, error: null, copied: false });
    } catch (e) {
      setState({ busy: false, error: e.status === 503 ? 'Sharing needs Raahi’s server to keep the trip, and saving isn’t switched on here yet.' : e.message, copied: false });
    }
  };
  const stop = async () => {
    setState({ busy: true, error: null, copied: false });
    try {
      await api.shareRevoke(current.tripId || trip.id, trip?.token);
      remember(current.tripId || trip.id, null);
      setCurrent(null);
      setState({ busy: false, error: null, copied: false });
    } catch (e) {
      setState({ busy: false, error: e.message, copied: false });
    }
  };
  const link = current ? shareLink(current.token) : '';
  const text = `Where we'll be each night on our trip north: ${link}`;

  return (
    <Dialog open={open} onClose={onClose} title="Share with family">
      <div className="flex flex-col gap-4 text-sm">
        <p className="flex gap-3 text-ink-700">
          <HeartHandshake size={20} className="mt-0.5 shrink-0 text-juniper-600" aria-hidden="true" />
          <span>A link for people at home: which town you sleep in each night, with dates, and what to do if they can’t reach
          you (mobile signal drops between valleys). It shows the plan, not where you are: Raahi doesn’t track anyone.
          No costs or names are shown.</span>
        </p>
        {storageOff && !current && <p className="rounded-md bg-ochre-50 p-3 text-ink-700">Sharing needs Raahi’s server to keep the trip, and saving isn’t switched on here yet.</p>}
        {!current ? (
          <>
            <div>
              <label htmlFor="share-note" className="field-label">A note for them (optional)</label>
              <textarea id="share-note" className="field min-h-[84px]" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Driver Akbar’s number, our hotel in Karimabad" />
              <p className="mt-1 text-xs text-ink-500">Anyone with the link can read this, so add only what you’d be happy to forward. {300 - note.length} characters left.</p>
            </div>
            <button type="button" className="btn-primary min-h-[48px] self-start" disabled={state.busy || storageOff} onClick={create}>
              <Share2 size={16} aria-hidden="true" /> {state.busy ? 'Making the link…' : 'Make the link'}
            </button>
          </>
        ) : (
          <>
            <div className="rounded-md border border-limestone-300 bg-limestone/50 p-3">
              <p className="font-semibold">Your family link</p>
              <p className="mt-1 break-all text-juniper-700">{link}</p>
              {current.note && <p className="mt-2 text-ink-600">Note: {current.note}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <a className="btn-primary min-h-[48px]" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={16} aria-hidden="true" /> Send on WhatsApp<span className="sr-only"> (opens WhatsApp)</span>
              </a>
              <button type="button" className="btn-outline min-h-[48px]" onClick={async () => {
                try {
                  if (navigator.share) await navigator.share({ title: 'Where we’ll be', text, url: link });
                  else { await navigator.clipboard.writeText(link); setState((s) => ({ ...s, copied: true })); }
                } catch { /* closed the share sheet */ }
              }}>
                {state.copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {state.copied ? 'Copied' : 'Copy or share'}
              </button>
              <a className="btn-quiet min-h-[48px]" href={link} target="_blank" rel="noopener noreferrer">Preview<span className="sr-only"> (opens in a new tab)</span></a>
            </div>
            <button type="button" className="btn-quiet min-h-[44px] self-start text-brick" disabled={state.busy || !trip?.token} onClick={stop}>
              <Link2Off size={16} aria-hidden="true" /> Stop sharing
            </button>
            <p className="text-xs text-ink-500">The page follows the saved plan, so changes you save show up there. Stop sharing and the link stops working at once.</p>
          </>
        )}
        {state.error && <p role="alert" className="text-brick">{state.error}</p>}
      </div>
    </Dialog>
  );
}
