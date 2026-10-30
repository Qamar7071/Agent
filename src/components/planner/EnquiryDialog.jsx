import { useEffect, useState } from 'react';
import { usePlanner } from '../../context/PlannerContext.jsx';
import { api } from '../../lib/api.js';
import { rememberEnquiry } from '../../lib/store.js';
import Dialog from '../ui/Dialog.jsx';
import Notice from '../ui/Notice.jsx';
import { Link } from '../../lib/router.jsx';

const METHODS = [['email', 'Email'], ['whatsapp', 'WhatsApp'], ['phone', 'Phone call']];

export default function EnquiryDialog() {
  const { enquiryDraft, closeEnquiry, itinerary, savedTrip } = usePlanner();
  const open = enquiryDraft !== null;
  const [consent, setConsent] = useState(null); // {open, text, version} | {error}
  const [form, setForm] = useState({ name: '', contact_method: 'email', contact_value: '', message: '', includePlan: true, agreed: false, website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (!open) return;
    setDone(null);
    setError(null);
    setForm((f) => ({ ...f, message: enquiryDraft?.message || f.message, contact_method: enquiryDraft?.contact_method || f.contact_method, agreed: false }));
    api.consent().then(setConsent).catch((e) => setConsent({ error: e.message }));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.agreed) {
      setError('Please tick the box to agree, or close this form.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.sendEnquiry({
        name: form.name,
        contact_method: form.contact_method,
        contact_value: form.contact_value,
        message: form.message || null,
        request: form.includePlan && itinerary ? itinerary.request : null,
        trip: form.includePlan && savedTrip?.token ? { id: savedTrip.id, token: savedTrip.token } : null,
        consent: true,
        consent_version: consent?.version,
        website: form.website,
      });
      rememberEnquiry({ reference: res.enquiry.reference, token: res.token, summary: res.enquiry.summary, sentAt: res.enquiry.created_at });
      setDone(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const contactLabel = form.contact_method === 'email' ? 'Email address' : 'Phone number, with country code';

  return (
    <Dialog open={open} onClose={closeEnquiry} title={done ? 'Enquiry sent' : 'Send a booking enquiry'}
      footer={done ? null : (
        <>
          <button type="button" onClick={closeEnquiry} className="btn-outline">Cancel</button>
          <button type="submit" form="enquiry-form" disabled={busy || !consent?.text || consent?.open === false} className="btn-primary px-6">
            {busy ? 'Sending…' : 'Send enquiry'}
          </button>
        </>
      )}>
      {done ? (
        <div className="flex flex-col gap-4">
          <p className="type-wide num text-2xl font-extrabold text-juniper">{done.enquiry.reference}</p>
          <p>{done.message}</p>
          <p className="text-sm text-ink-600">
            Keep this reference. You can check its status or withdraw it from <Link to="/trips" onClick={closeEnquiry} className="link">My trips</Link>.
            This browser keeps the private key that lets you do that.
          </p>
          <button type="button" onClick={closeEnquiry} className="btn-primary self-start">Close</button>
        </div>
      ) : (
        <form id="enquiry-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Notice level="info">
            This is an enquiry, not a booking. Nothing is reserved or paid. A person reads it and replies; real prices
            come with that reply.
          </Notice>
          {consent?.error && <Notice level="warning">Couldn’t reach the server: {consent.error}</Notice>}
          {consent && consent.open === false && (
            <Notice level="warning" title="Enquiries aren’t open yet">
              This website can’t receive enquiries yet, so nothing can be sent. You can still save your trip.
            </Notice>
          )}
          <div>
            <label htmlFor="eq-name" className="field-label">Your name</label>
            <input id="eq-name" required maxLength={80} value={form.name} onChange={set('name')} className="field" autoComplete="name" />
          </div>
          <fieldset>
            <legend className="field-label">How should we reply?</legend>
            <div className="flex flex-wrap gap-2">
              {METHODS.map(([id, label]) => (
                <label key={id} className={`chip cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-juniper-600 ${form.contact_method === id ? 'border-juniper bg-juniper text-on-juniper' : ''}`}>
                  <input type="radio" name="eq-method" value={id} checked={form.contact_method === id} onChange={set('contact_method')} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="eq-contact" className="field-label">{contactLabel}</label>
            <input id="eq-contact" required maxLength={120} value={form.contact_value} onChange={set('contact_value')} className="field"
              type={form.contact_method === 'email' ? 'email' : 'tel'} autoComplete={form.contact_method === 'email' ? 'email' : 'tel'} />
          </div>
          <div>
            <label htmlFor="eq-msg" className="field-label">Message (optional)</label>
            <textarea id="eq-msg" rows={3} maxLength={1000} value={form.message} onChange={set('message')} className="field py-2" />
          </div>
          {itinerary && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={form.includePlan} onChange={set('includePlan')} className="mt-1 h-4 w-4 accent-juniper" />
              <span>Include my plan: {itinerary.title}, {itinerary.days.length} days.</span>
            </label>
          )}
          <div className="hidden" aria-hidden="true">
            <label htmlFor="eq-website">Leave this empty</label>
            <input id="eq-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
          </div>
          <label className="flex items-start gap-2 rounded border border-limestone-300 bg-limestone p-3 text-sm">
            <input type="checkbox" checked={form.agreed} onChange={set('agreed')} className="mt-1 h-4 w-4 shrink-0 accent-juniper" />
            <span>{consent?.text || 'Loading the consent statement…'}</span>
          </label>
          {error && <Notice level="danger">{error}</Notice>}
        </form>
      )}
    </Dialog>
  );
}
