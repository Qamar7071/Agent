import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { usePageMeta } from '../lib/seo.js';
import { readSession, writeSession } from '../lib/store.js';
import { checkedAt } from '../lib/format.js';
import Notice from '../components/ui/Notice.jsx';

const STATUSES = [['new', 'New'], ['in_review', 'In review'], ['contacted', 'Contacted'], ['closed', 'Closed'], ['spam', 'Spam']];
const KEY = 'raahi:admin-key';

function contactHref(e) {
  if (e.contact_method === 'email') return `mailto:${e.contact_value}?subject=${encodeURIComponent(`Your Raahi enquiry ${e.reference}`)}`;
  const digits = e.contact_value.replace(/[^\d+]/g, '');
  return e.contact_method === 'whatsapp' ? `https://wa.me/${digits.replace(/^\+/, '')}` : `tel:${digits}`;
}

function Row({ e, adminKey, onSaved }) {
  const [status, setStatus] = useState(e.status);
  const [note, setNote] = useState(e.admin_note || '');
  const [state, setState] = useState({ busy: false, error: null, ok: false });
  const save = async () => {
    setState({ busy: true, error: null, ok: false });
    try {
      onSaved((await api.adminUpdate(adminKey, e.reference, { status, admin_note: note })).enquiry);
      setState({ busy: false, error: null, ok: true });
    } catch (err) {
      setState({ busy: false, error: err.message, ok: false });
    }
  };
  return (
    <li className="grid gap-4 border-b border-limestone-300 py-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="min-w-0 text-sm">
        <p className="num text-base font-bold">{e.reference}</p>
        <p className="text-ink-600">Received {checkedAt(e.created_at)}. Consent {e.consent_version}.</p>
        <p className="mt-2"><span className="font-semibold">{e.name}</span>, by {e.contact_method}:{' '}
          <a href={contactHref(e)} className="link" target={e.contact_method === 'whatsapp' ? '_blank' : undefined} rel="noopener noreferrer">{e.contact_value}</a>
        </p>
        {e.summary && <p className="mt-1 text-ink-700">{e.summary}</p>}
        {e.message && <p className="mt-2 whitespace-pre-wrap rounded bg-limestone p-2 text-ink-700">{e.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold" htmlFor={`st-${e.reference}`}>Status</label>
        <select id={`st-${e.reference}`} value={status} onChange={(ev) => setStatus(ev.target.value)} className="field">
          {STATUSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <label className="text-sm font-semibold" htmlFor={`nt-${e.reference}`}>Private note</label>
        <textarea id={`nt-${e.reference}`} rows={2} maxLength={1000} value={note} onChange={(ev) => setNote(ev.target.value)} className="field py-2" />
        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={state.busy} className="btn-primary">{state.busy ? 'Saving…' : 'Save'}</button>
          {state.ok && <span className="text-sm text-juniper-600" role="status">Saved</span>}
          {state.error && <span className="text-sm text-brick" role="alert">{state.error}</span>}
        </div>
      </div>
    </li>
  );
}

export default function Admin() {
  usePageMeta({ title: 'Enquiries (admin)', path: '/admin', noindex: true });
  const [adminKey, setAdminKey] = useState(() => readSession(KEY, ''));
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState('');
  const [state, setState] = useState({ status: 'idle', list: [], error: null });

  const load = useCallback(async () => {
    if (!adminKey) return;
    setState((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const res = await api.adminList(adminKey, filter || undefined);
      setState({ status: 'ready', list: res.enquiries, error: null });
    } catch (e) {
      if (e.status === 401) {
        writeSession(KEY, null);
        setAdminKey('');
      }
      setState({ status: 'error', list: [], error: e.message });
    }
  }, [adminKey, filter]);
  useEffect(() => {
    load();
  }, [load]);

  if (!adminKey) {
    return (
      <main id="main" className="mx-auto mt-16 min-h-[70vh] max-w-md px-4 py-16">
        <h1 className="type-wide text-3xl font-extrabold">Enquiries</h1>
        <p className="mt-3 text-ink-600">For the Raahi team. Enter the admin key set on the server (ADMIN_TOKEN). It is kept only for this browser tab.</p>
        {state.error && <Notice level="danger" className="mt-4">{state.error}</Notice>}
        <form className="mt-6 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); writeSession(KEY, draft.trim()); setAdminKey(draft.trim()); }}>
          <label htmlFor="admin-key" className="field-label">Admin key</label>
          <input id="admin-key" type="password" autoComplete="current-password" value={draft} onChange={(e) => setDraft(e.target.value)} className="field" required />
          <button type="submit" className="btn-primary self-start">Open enquiries</button>
        </form>
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto mt-16 min-h-[70vh] max-w-page px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="type-wide text-3xl font-extrabold">Enquiries</h1>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="flt" className="text-sm font-semibold">Show</label>
          <select id="flt" value={filter} onChange={(e) => setFilter(e.target.value)} className="field w-auto">
            <option value="">All</option>
            {STATUSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <button type="button" onClick={load} className="btn-outline">Refresh</button>
          <button type="button" onClick={() => { writeSession(KEY, null); setAdminKey(''); }} className="btn-quiet">Sign out</button>
        </div>
      </div>
      <Notice level="info" className="mt-6">
        Reply to each traveller yourself. Nothing here books or charges anything; never tell a traveller a booking is
        confirmed until the hotel or operator has confirmed it.
      </Notice>
      {state.status === 'loading' && <p className="mt-6 text-ink-600" role="status">Loading…</p>}
      {state.status === 'error' && <Notice level="danger" className="mt-6">{state.error}</Notice>}
      {state.status === 'ready' && !state.list.length && <p className="mt-6 text-ink-600">No enquiries{filter ? ' with this status' : ' yet'}.</p>}
      <ul className="mt-4">
        {state.list.map((e) => (
          <Row key={e.reference} e={e} adminKey={adminKey}
            onSaved={(updated) => setState((s) => ({ ...s, list: s.list.map((x) => (x.reference === updated.reference ? updated : x)) }))} />
        ))}
      </ul>
    </main>
  );
}
