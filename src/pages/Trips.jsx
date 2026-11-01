import { useState } from 'react';
import { Link, useRouter } from '../lib/router.jsx';
import { api } from '../lib/api.js';
import { usePageMeta } from '../lib/seo.js';
import { forgetEnquiry, forgetTrip, savedEnquiries, savedTrips } from '../lib/store.js';
import { listCompanions, loadCompanion, removeCompanion } from '../lib/companion/store.js';
import { myGroups, prettyCode } from '../lib/group/store.js';
import { ago, checkedAt } from '../lib/format.js';
import Notice from '../components/ui/Notice.jsx';

const STATUS = { new: 'Received, waiting for review', in_review: 'Being reviewed', contacted: 'We have replied', closed: 'Closed', spam: 'Closed' };

function TripRow({ trip, onGone }) {
  const { navigate } = useRouter();
  const [state, setState] = useState({ busy: false, error: null });
  const remove = async () => {
    if (!window.confirm(`Delete “${trip.title}”? This removes it from Raahi’s server too.`)) return;
    setState({ busy: true, error: null });
    try {
      await api.deleteTrip(trip.id, trip.token);
    } catch (e) {
      if (e.status !== 404) {
        setState({ busy: false, error: e.message });
        return;
      }
    }
    forgetTrip(trip.id);
    removeCompanion(trip.id);
    onGone();
  };
  return (
    <li className="flex flex-col gap-3 border-b border-limestone-300 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="type-semiwide text-lg font-bold">{trip.title}</p>
        <p className="text-sm text-ink-600">Saved {ago(trip.savedAt)}</p>
        {state.error && <p className="mt-1 text-sm text-brick" role="alert">{state.error}</p>}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => navigate(`/plan?trip=${trip.id}`)} className="btn-primary">Open</button>
        <button type="button" onClick={() => navigate(loadCompanion(trip.id) ? `/trip/${trip.id}` : `/trip/new?trip=${trip.id}`)}
          className="btn-outline">{loadCompanion(trip.id) ? 'Trip companion' : 'Start trip'}</button>
        <button type="button" onClick={() => {
          const g = myGroups().find((x) => x.tripId === trip.id);
          navigate(g ? `/g/${g.code}` : `/g/new?trip=${trip.id}`);
        }} className="btn-outline">Group room</button>
        <button type="button" disabled={state.busy} onClick={remove} className="btn-outline">Delete</button>
      </div>
    </li>
  );
}

function EnquiryRow({ enquiry, onGone }) {
  const [state, setState] = useState({ busy: false, status: null, error: null });
  const check = async () => {
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const res = await api.enquiryStatus(enquiry.reference, enquiry.token);
      setState({ busy: false, status: res.enquiry, error: null });
    } catch (e) {
      setState({ busy: false, status: null, error: e.status === 404 ? 'This enquiry no longer exists.' : e.message });
    }
  };
  const withdraw = async () => {
    if (!window.confirm(`Withdraw enquiry ${enquiry.reference}? Your details will be deleted from Raahi’s server.`)) return;
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      await api.withdrawEnquiry(enquiry.reference, enquiry.token);
    } catch (e) {
      if (e.status !== 404) {
        setState((s) => ({ ...s, busy: false, error: e.message }));
        return;
      }
    }
    forgetEnquiry(enquiry.reference);
    onGone();
  };
  return (
    <li className="flex flex-col gap-3 border-b border-limestone-300 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="num font-bold">{enquiry.reference}</p>
        {enquiry.summary && <p className="text-sm text-ink-700">{enquiry.summary}</p>}
        <p className="text-sm text-ink-600">Sent {ago(enquiry.sentAt)}</p>
        {state.status && (
          <p className="mt-1 text-sm font-semibold text-juniper-600" aria-live="polite">
            {STATUS[state.status.status] || state.status.status} (updated {checkedAt(state.status.updated_at)}). Not a booking.
          </p>
        )}
        {state.error && <p className="mt-1 text-sm text-brick" role="alert">{state.error}</p>}
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={state.busy} onClick={check} className="btn-outline">Check status</button>
        <button type="button" disabled={state.busy} onClick={withdraw} className="btn-outline">Withdraw</button>
      </div>
    </li>
  );
}

export default function Trips() {
  usePageMeta({ title: 'My trips', path: '/trips', noindex: true });
  const [, refresh] = useState(0);
  const trips = savedTrips();
  const enquiries = savedEnquiries();
  return (
    <main id="main" className="mx-auto mt-16 min-h-[70vh] max-w-page px-4 py-12 sm:px-6">
      <h1 className="type-wide text-3xl font-extrabold sm:text-4xl">My trips</h1>
      <p className="mt-3 max-w-prose text-ink-600">
        Trips you saved and enquiries you sent from this browser. Raahi has no accounts: each one is protected by a
        private key stored only in this browser, so they won’t appear on another device.
      </p>

      {myGroups().length > 0 && (
        <section aria-labelledby="groups-h" className="mt-10">
          <h2 id="groups-h" className="type-semiwide text-xl font-bold">Your groups</h2>
          <ul className="mt-2">
            {myGroups().map((g) => (
              <li key={g.code} className="flex flex-col gap-3 border-b border-limestone-300 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="type-semiwide text-lg font-bold">{g.title || 'Group trip'}</p>
                  <p className="text-sm text-ink-600">Code {prettyCode(g.code)} · you are {g.name}{g.organizer ? ' (organizer)' : ''}</p>
                </div>
                <Link to={`/g/${g.code}`} className="btn-primary">Open</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {listCompanions().length > 0 && (
        <section aria-labelledby="going-h" className="mt-10">
          <h2 id="going-h" className="type-semiwide text-xl font-bold">Trips on the go (Safar Saathi)</h2>
          <ul className="mt-2">
            {listCompanions().map((t) => (
              <li key={t.id} className="flex flex-col gap-3 border-b border-limestone-300 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="type-semiwide text-lg font-bold">{t.title}</p>
                  <p className="text-sm text-ink-600">{t.days} days{t.startDate ? ` from ${t.startDate}` : ''}{t.id.startsWith('local-') ? ' · on this phone only' : ''}</p>
                </div>
                <div className="flex gap-2">
                  <Link to={`/trip/${t.id}`} className="btn-primary">Open</Link>
                  {t.id.startsWith('local-') && (
                    <button type="button" className="btn-outline" onClick={() => {
                      if (window.confirm(`Delete “${t.title}” and its expenses from this phone?`)) { removeCompanion(t.id); refresh((x) => x + 1); }
                    }}>Delete</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="saved-h" className="mt-10">
        <h2 id="saved-h" className="type-semiwide text-xl font-bold">Saved trips</h2>
        {trips.length ? (
          <ul className="mt-2">{trips.map((t) => <TripRow key={t.id} trip={t} onGone={() => refresh((n) => n + 1)} />)}</ul>
        ) : (
          <div className="mt-3 flex flex-col items-start gap-3">
            <p className="text-ink-600">No saved trips in this browser yet. Build a plan and press “Save trip”.</p>
            <Link to="/plan" className="btn-primary">Plan a trip</Link>
          </div>
        )}
      </section>

      <section aria-labelledby="enq-h" className="mt-12">
        <h2 id="enq-h" className="type-semiwide text-xl font-bold">Booking enquiries</h2>
        {enquiries.length ? (
          <ul className="mt-2">{enquiries.map((e) => <EnquiryRow key={e.reference} enquiry={e} onGone={() => refresh((n) => n + 1)} />)}</ul>
        ) : (
          <p className="mt-3 text-ink-600">No enquiries sent from this browser.</p>
        )}
        <Notice level="info" className="mt-6 max-w-prose">
          An enquiry is not a booking. Nothing is reserved or paid until you agree it directly with a hotel or operator.
        </Notice>
      </section>
    </main>
  );
}
