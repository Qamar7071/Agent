// Group Room: /g/new creates a group for a saved trip; /g/<code> lets anyone with the link join
// with just a name, then shows the room.
import { useEffect, useState } from 'react';
import { Heart, Mountain, User, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { useRouter } from '../lib/router.jsx';
import { usePageMeta } from '../lib/seo.js';
import { read } from '../lib/store.js';
import { savedTrips } from '../lib/store.js';
import { usePlanner } from '../context/PlannerContext.jsx';
import { groupStrings } from '../lib/group/i18n.js';
import { groupEntry, normaliseCode, rememberGroup } from '../lib/group/store.js';
import { LanguageSwitch } from '../components/companion/TripSettings.jsx';
import Room, { ShareCard } from '../components/group/Room.jsx';
import Notice from '../components/ui/Notice.jsx';

const TYPE_ICON = { friends: Users, family: Heart, couple: Mountain, solo: User };

function useLang() {
  const [lang, setLangState] = useState(() => read('raahi:lang', 'en'));
  const setLang = (l) => {
    setLangState(l);
    try { localStorage.setItem('raahi:lang', JSON.stringify(l)); } catch { /* ok */ }
  };
  return [lang, setLang];
}

function Create({ s }) {
  const { query, navigate } = useRouter();
  const planner = usePlanner();
  const [type, setType] = useState('friends');
  const [name, setName] = useState('');
  const [state, setState] = useState({ busy: false, error: null, created: null });
  const storageOff = planner.health && !planner.health.storage?.enabled;
  const fromTrip = query.get('trip');

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setState({ busy: false, error: s.yourName, created: null });
      return;
    }
    setState({ busy: true, error: null, created: null });
    try {
      let trip = fromTrip ? savedTrips().find((t) => t.id === fromTrip) : planner.savedTrip;
      if (!trip?.token) trip = await planner.saveTrip();           // the group needs a saved trip
      if (!trip?.token) throw new Error(s.needSave);
      const res = await api.groupCreate(trip.id, trip.token, type, name.trim());
      rememberGroup({ code: res.code, memberId: res.member.id, token: res.member.token, name: name.trim(), organizer: true,
        tripId: trip.id, tripToken: trip.token, title: res.trip });
      setState({ busy: false, error: null, created: { code: res.code, title: res.trip } });
    } catch (err) {
      setState({ busy: false, error: err.message, created: null });
    }
  };

  if (state.created) {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <ShareCard s={s} code={state.created.code} title={state.created.title} />
        <button type="button" className="btn-primary min-h-[52px] self-start text-base" onClick={() => navigate(`/g/${state.created.code}`)}>{s.openRoom}</button>
      </div>
    );
  }
  if (storageOff) return <Notice level="info" className="mt-6">{s.storageOff}</Notice>;
  if (!fromTrip && !planner.itinerary) {
    return <Notice level="info" className="mt-6" action={<button type="button" className="btn-primary" onClick={() => navigate('/plan')}>{s.planWithFriends}</button>}>{s.needSave}</Notice>;
  }
  return (
    <form onSubmit={create} className="mt-6 flex flex-col gap-6" noValidate>
      {!planner.savedTrip && !fromTrip && <p className="text-sm text-ink-600">{s.needSave}</p>}
      <fieldset>
        <legend className="field-label">{s.tripType}</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={s.tripType}>
          {Object.keys(s.types).map((t) => {
            const Icon = TYPE_ICON[t];
            return (
              <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)}
                className="chip h-auto min-h-[64px] w-full flex-col items-start justify-center rounded-md px-3 py-2 text-left">
                <span className="flex items-center gap-2 font-semibold"><Icon size={16} aria-hidden="true" />{s.types[t]}</span>
                <span className="text-xs opacity-90">{s.typeHint[t]}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <div>
        <label htmlFor="org-name" className="field-label">{s.yourName}</label>
        <input id="org-name" className="field" maxLength={40} value={name} autoComplete="given-name" onChange={(e) => setName(e.target.value)} />
      </div>
      {state.error && <p role="alert" className="text-sm text-brick">{state.error}</p>}
      <button type="submit" className="btn-primary min-h-[52px] self-start text-base" disabled={state.busy}>{state.busy ? s.creating : s.create}</button>
    </form>
  );
}

function Join({ code, s, onJoined }) {
  const [preview, setPreview] = useState({ state: 'loading', data: null, error: null });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.groupPreview(code).then((d) => setPreview({ state: 'ready', data: d }))
      .catch((e) => setPreview({ state: 'error', error: e }));
  }, [code]);
  if (preview.state === 'loading') return <p className="mt-8 text-ink-600" role="status">…</p>;
  if (preview.state === 'error') {
    return <Notice level={preview.error.status === 404 ? 'warning' : 'danger'} className="mt-6">
      {preview.error.status === 404 ? s.notFound : preview.error.status === 503 ? s.storageOff : preview.error.message}
    </Notice>;
  }
  const p = preview.data;
  const join = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError(s.yourName);
    setBusy(true);
    setError(null);
    try {
      const res = await api.groupJoin(code, name.trim());
      rememberGroup({ code: res.code, memberId: res.member.id, token: res.member.token, name: name.trim(), organizer: false, title: p.title });
      onJoined();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
    return undefined;
  };
  return (
    <form onSubmit={join} className="mt-6 flex flex-col gap-4" noValidate>
      <h2 className="type-semiwide text-2xl font-bold">{s.joinTitle(p.title)}</h2>
      <p className="text-ink-600">{s.types[p.trip_type]} · {s.joinBy(p.organizer, p.members)}</p>
      <div>
        <label htmlFor="join-name" className="field-label">{s.yourName}</label>
        <input id="join-name" className="field" maxLength={40} value={name} autoComplete="given-name" onChange={(e) => setName(e.target.value)} />
      </div>
      {error && <p role="alert" className="text-sm text-brick">{error}</p>}
      <button type="submit" className="btn-primary min-h-[52px] self-start text-base" disabled={busy}>{busy ? s.joining : s.join}</button>
    </form>
  );
}

export default function GroupRoom({ code: rawCode }) {
  const [lang, setLang] = useLang();
  const s = groupStrings(lang);
  const isNew = rawCode === 'new';
  const code = isNew ? null : normaliseCode(rawCode);
  const [entry, setEntry] = useState(() => (code ? groupEntry(code) : null));
  usePageMeta({ title: s.title, path: isNew ? '/g/new' : `/g/${code}`, noindex: true });
  return (
    <main id="main" className="mx-auto mt-16 min-h-[70vh] w-full max-w-2xl px-4 pb-20 pt-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-juniper-600">{s.title}{entry?.title ? ` · ${entry.title}` : ''}</p>
        <LanguageSwitch value={lang} onChange={setLang} label={s.language} />
      </div>
      {isNew && (
        <>
          <h1 className="type-wide mt-3 text-3xl font-extrabold">{s.planWithFriends}</h1>
          <p className="mt-2 text-ink-600">{s.intro}</p>
          <Create s={s} />
        </>
      )}
      {!isNew && !entry && <Join code={code} s={s} onJoined={() => setEntry(groupEntry(code))} />}
      {!isNew && entry && (
        <>
          <h1 className="type-wide mt-3 text-3xl font-extrabold">{entry.title || s.title}</h1>
          <Room code={code} entry={entry} s={s} onLeft={() => setEntry(null)} />
        </>
      )}
    </main>
  );
}
