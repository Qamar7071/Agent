// "Start trip": one short, pre-filled screen. Names, budget, first day, language. That's it.
import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useRouter } from '../../lib/router.jsx';
import { savedTrips } from '../../lib/store.js';
import { usePlanner } from '../../context/PlannerContext.jsx';
import { localDate } from '../../lib/companion/pace.js';
import { strings } from '../../lib/companion/i18n.js';
import { LANG_KEY, budgetTotalFrom, createCompanion, defaultMembers, loadCompanion, saveCompanion } from '../../lib/companion/store.js';
import { read } from '../../lib/store.js';
import { BudgetFields, LanguageSwitch } from './TripSettings.jsx';
import Notice from '../ui/Notice.jsx';

export default function StartTrip() {
  const { query, navigate } = useRouter();
  const planner = usePlanner();
  const [lang, setLang] = useState(() => read(LANG_KEY, 'en'));
  const s = strings(lang);
  const [source, setSource] = useState({ state: 'loading', itinerary: null, trip: null, error: null });
  const [members, setMembers] = useState([]);
  const [amount, setAmount] = useState('');
  const [basis, setBasis] = useState('total');
  const [startDate, setStartDate] = useState(localDate());
  const [error, setError] = useState(null);

  useEffect(() => {
    let off = false;
    const tripId = query.get('trip');
    (async () => {
      if (tripId) {
        if (loadCompanion(tripId)) return navigate(`/trip/${tripId}`, { replace: true });
        const saved = savedTrips().find((t) => t.id === tripId);
        if (!saved) return setSource({ state: 'error', error: s.notHereHelp });
        try {
          const res = await api.getTrip(saved.id, saved.token);
          if (!off) setSource({ state: 'ready', itinerary: res.trip.itinerary, trip: { id: saved.id, token: saved.token } });
        } catch (e) {
          if (!off) setSource({ state: 'error', error: e.message });
        }
        return undefined;
      }
      const it = planner.itinerary;
      if (!it) return setSource({ state: 'error', error: s.needPlan });
      const st = planner.savedTrip;
      if (st?.id && loadCompanion(st.id)) return navigate(`/trip/${st.id}`, { replace: true });
      setSource({ state: 'ready', itinerary: it, trip: st?.token ? { id: st.id, token: st.token } : null });
      return undefined;
    })();
    return () => { off = true; };
  }, [query.get('trip')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (source.state !== 'ready') return;
    const req = source.itinerary.request;
    setMembers(defaultMembers(req, lang));
    if (req.budget_pkr) {
      setAmount(String(req.budget_pkr));
      setBasis(req.budget_basis === 'per_person' ? 'per_person' : 'total');
    }
    if (req.start_date) setStartDate(req.start_date);
  }, [source.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (e) => {
    e.preventDefault();
    const clean = members.map((m) => ({ ...m, name: m.name.trim() }));
    if (clean.some((m) => !m.name)) {
      setError(s.needName);
      document.getElementById(`sm-${clean.find((m) => !m.name).id}`)?.focus();
      return;
    }
    try { localStorage.setItem(LANG_KEY, JSON.stringify(lang)); } catch { /* ok */ }
    const c = createCompanion({
      trip: source.trip, itinerary: source.itinerary,
      settings: { members: clean, budgetTotal: budgetTotalFrom(amount, basis, clean.length), budgetBasis: basis,
        startDate: startDate || null, language: lang, adjustments: [] },
    });
    saveCompanion(c);
    navigate(`/trip/${c.id}`, { replace: true });
  };

  return (
    <main id="main" className="mx-auto mt-16 min-h-[70vh] w-full max-w-xl px-4 pb-16 pt-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-juniper-600">{s.appName}</p>
        <LanguageSwitch value={lang} label={s.language} onChange={(l) => {
          setLang(l);
          // default names follow the language; names the user typed are kept
          setMembers((ms) => ms.map((m, i) => (/^(Member|Saathi) \d+$/.test(m.name) ? { ...m, name: `${l === 'ur' ? 'Saathi' : 'Member'} ${i + 1}` } : m)));
        }} />
      </div>
      <h1 className="type-wide mt-3 text-3xl font-extrabold">{s.startTitle}</h1>
      <p className="mt-2 text-ink-600">{s.startIntro}</p>
      {source.state === 'loading' && <p className="mt-8 text-ink-600" role="status">{s.loadingTrip}</p>}
      {source.state === 'error' && (
        <Notice level="warning" className="mt-8" action={<button type="button" className="btn-primary" onClick={() => navigate('/plan')}>{s.planInPlanner}</button>}>
          {source.error}
        </Notice>
      )}
      {source.state === 'ready' && (
        <form onSubmit={start} className="mt-6 flex flex-col gap-6" noValidate>
          <p className="panel px-4 py-3 font-semibold">{source.itinerary.title} · {source.itinerary.days.length} {lang === 'ur' ? 'din' : 'days'}</p>
          <fieldset>
            <legend className="field-label flex items-center gap-2"><Users size={16} aria-hidden="true" /> {s.members}</legend>
            <ul className="flex flex-col gap-2">
              {members.map((m, i) => (
                <li key={m.id}>
                  <label htmlFor={`sm-${m.id}`} className="sr-only">{i === 0 ? s.yourName : s.memberName(i + 1)}</label>
                  <input id={`sm-${m.id}`} className="field" maxLength={40} value={m.name} placeholder={i === 0 ? s.yourName : s.memberName(i + 1)}
                    autoComplete={i === 0 ? 'given-name' : 'off'}
                    onChange={(e) => setMembers(members.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)))} />
                </li>
              ))}
            </ul>
            {members.length < 20 && (
              <button type="button" className="btn-quiet mt-2 -ml-2.5 min-h-[44px]"
                onClick={() => setMembers([...members, { id: `m${members.length + 1}`, name: '', active: true }])}>+ {s.addMember}</button>
            )}
          </fieldset>
          <BudgetFields s={s} amount={amount} basis={basis} setAmount={setAmount} setBasis={setBasis} people={members.length} />
          <div>
            <label htmlFor="trip-start" className="field-label">{s.startDate}</label>
            <input id="trip-start" type="date" className="field" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-brick">{error}</p>}
          <button type="submit" className="btn-primary min-h-[52px] text-base">{s.start}</button>
          {!source.trip && <p className="text-sm text-ink-600">{s.localOnly}</p>}
        </form>
      )}
    </main>
  );
}
