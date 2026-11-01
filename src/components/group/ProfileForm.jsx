// A member's answers in about a minute: chips only, no typing. Private needs sit in their own
// fold, are optional, and say plainly how they are stored and who sees what.
import { useState } from 'react';
import { Lock } from 'lucide-react';
import { destinations } from '../../lib/data.js';

const INTERESTS = ['mountains', 'lakes', 'culture', 'food', 'photography', 'trekking', 'relaxation', 'family'];
const NO_GO = ['long_drives', 'high_altitude', 'hikes', 'camping', 'early_starts'];
const NEEDS = ['altitude', 'breathing', 'motion_sickness', 'limited_walking', 'food_vegetarian', 'food_mild', 'food_allergy'];

function Chips({ legend, items, value, onToggle, multi = true, name }) {
  return (
    <fieldset>
      <legend className="field-label">{legend}</legend>
      <div className="flex flex-wrap gap-2" role={multi ? 'group' : 'radiogroup'} aria-label={legend}>
        {items.map(([id, label]) => {
          const on = multi ? value.includes(id) : value === id;
          return (
            <button key={id} type="button" role={multi ? undefined : 'radio'} aria-pressed={multi ? on : undefined}
              aria-checked={multi ? undefined : on} name={name} onClick={() => onToggle(id)} className="chip min-h-[44px] max-w-full">
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function ProfileForm({ s, initial, initialNeeds, onSave, onCancel }) {
  const [interests, setInterests] = useState(initial?.interests || []);
  const [budget, setBudget] = useState(initial?.budget_comfort || null);
  const [pace, setPace] = useState(initial?.pace || null);
  const [must, setMust] = useState(initial?.must_do || []);
  const [noGo, setNoGo] = useState(initial?.no_go || []);
  const [needs, setNeeds] = useState(initialNeeds?.codes || []);
  const [showName, setShowName] = useState(Boolean(initialNeeds?.showName));
  const [openPrivate, setOpenPrivate] = useState(Boolean(initialNeeds?.codes?.length));
  const [state, setState] = useState({ busy: false, error: null });
  const toggle = (list, set, max = 8) => (id) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(0, max));

  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: null });
    try {
      await onSave({ interests, budget_comfort: budget, pace, must_do: must, no_go: noGo }, { codes: needs, showName });
    } catch (err) {
      setState({ busy: false, error: err.message });
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <div>
        <h2 className="type-semiwide text-xl font-bold">{s.profileTitle}</h2>
        <p className="mt-1 text-sm text-ink-600">{s.profileIntro}</p>
      </div>
      <Chips legend={s.interests} items={INTERESTS.map((i) => [i, s.interestList[i]])} value={interests} onToggle={toggle(interests, setInterests)} />
      <Chips legend={s.budget} multi={false} items={Object.entries(s.budgets)} value={budget} onToggle={(v) => setBudget(budget === v ? null : v)} />
      <Chips legend={s.pace} multi={false} items={Object.entries(s.paces)} value={pace} onToggle={(v) => setPace(pace === v ? null : v)} />
      <Chips legend={s.mustDo} items={destinations.map((d) => [d.id, d.name])} value={must} onToggle={toggle(must, setMust)} />
      <Chips legend={s.noGo} items={NO_GO.map((n) => [n, s.noGos[n]])} value={noGo} onToggle={toggle(noGo, setNoGo, 5)} />

      <section className="rounded-md border border-limestone-300 bg-limestone/40 p-4" aria-labelledby="private-h">
        <button type="button" id="private-h" aria-expanded={openPrivate} onClick={() => setOpenPrivate((v) => !v)}
          className="flex min-h-[44px] w-full items-center gap-2 text-left font-semibold">
          <Lock size={16} aria-hidden="true" className="text-juniper-600" /> {s.private}
        </button>
        {openPrivate && (
          <div className="mt-2 flex flex-col gap-3">
            <p className="text-sm text-ink-600">{s.privateHow}</p>
            <div className="flex flex-col gap-1">
              {NEEDS.map((n) => (
                <label key={n} className="flex min-h-[44px] items-center gap-3 text-sm">
                  <input type="checkbox" className="h-5 w-5 shrink-0" checked={needs.includes(n)}
                    onChange={() => setNeeds(needs.includes(n) ? needs.filter((x) => x !== n) : [...needs, n])} />
                  {s.needs[n]}
                </label>
              ))}
            </div>
            <label className="flex min-h-[44px] items-center gap-3 border-t border-limestone-300 pt-2 text-sm">
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
              {s.showName}
            </label>
            <p className="text-xs font-semibold text-ink-700">{s.notMedical}</p>
          </div>
        )}
      </section>

      {state.error && <p role="alert" className="text-sm text-brick">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary min-h-[48px]" disabled={state.busy}>{state.busy ? s.saving : s.saveAnswers}</button>
        {onCancel && <button type="button" className="btn-outline min-h-[48px]" onClick={onCancel}>{s.cancel}</button>}
      </div>
    </form>
  );
}
