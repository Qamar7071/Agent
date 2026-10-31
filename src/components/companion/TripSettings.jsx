// Trip settings during the trip: language, who is travelling (add, rename, mark as left),
// the budget and the first day. Members who left keep their history for the settle-up.
import { useEffect, useState } from 'react';
import Dialog from '../ui/Dialog.jsx';
import { pkr } from '../../lib/format.js';
import { LANGS } from '../../lib/companion/i18n.js';
import { budgetTotalFrom } from '../../lib/companion/store.js';
import { MAX_MEMBERS } from '../../lib/companion/limits.js';

export function LanguageSwitch({ value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-limestone-400 p-0.5">
      {Object.entries(LANGS).map(([code, name]) => (
        <button key={code} type="button" role="radio" aria-checked={value === code} onClick={() => onChange(code)}
          className={`min-h-[40px] rounded-full px-3 text-sm font-semibold ${value === code ? 'bg-juniper text-on-juniper' : 'text-ink-700'}`}>
          {name}
        </button>
      ))}
    </div>
  );
}

export function BudgetFields({ s, amount, basis, setAmount, setBasis, people }) {
  const total = budgetTotalFrom(amount, basis, people);
  return (
    <fieldset>
      <legend className="field-label">{s.budget}</legend>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="budget-amount" className="sr-only">{s.budget}</label>
        <input id="budget-amount" className="field num sm:max-w-[12rem]" inputMode="numeric" value={amount}
          placeholder="1,50,000" onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 9))} />
        <div role="radiogroup" aria-label={s.budget} className="flex gap-2">
          {['total', 'per_person'].map((b) => (
            <button key={b} type="button" role="radio" aria-checked={basis === b} onClick={() => setBasis(b)} className="chip min-h-[44px]">
              {s.budgetBasis[b]}
            </button>
          ))}
        </div>
      </div>
      {total ? <p className="num mt-1.5 text-sm text-ink-600">{s.budgetIs(pkr(total))}</p> : null}
    </fieldset>
  );
}

export default function TripSettings({ open, onClose, hub }) {
  const { c, s, updateSettings } = hub;
  const [members, setMembers] = useState(c.settings.members);
  const [amount, setAmount] = useState('');
  const [basis, setBasis] = useState('total');
  const [startDate, setStartDate] = useState(c.settings.startDate || '');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setMembers(c.settings.members);
    setAmount(c.settings.budgetTotal ? String(c.settings.budgetTotal) : '');
    setBasis('total');
    setStartDate(c.settings.startDate || '');
    setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (e) => {
    e.preventDefault();
    const clean = members.map((m) => ({ ...m, name: m.name.trim() }));
    if (clean.some((m) => !m.name)) {
      setError(s.needName);
      return;
    }
    const active = clean.filter((m) => m.active !== false).length;
    updateSettings({ members: clean, budgetTotal: budgetTotalFrom(amount, basis, active), startDate: startDate || null });
    onClose();
  };
  const nextId = () => `m${Math.max(0, ...members.map((m) => Number(m.id.slice(1)) || 0)) + 1}`;

  return (
    <Dialog open={open} onClose={onClose} title={s.settings}
      footer={(<><button type="button" className="btn-outline" onClick={onClose}>{s.cancel}</button>
        <button type="submit" form="trip-settings" className="btn-primary">{s.save}</button></>)}>
      <form id="trip-settings" onSubmit={save} className="flex flex-col gap-5" noValidate>
        <div>
          <p className="field-label">{s.language}</p>
          <LanguageSwitch value={hub.lang} onChange={(l) => updateSettings({ language: l })} label={s.language} />
        </div>
        <fieldset>
          <legend className="field-label">{s.members}</legend>
          <ul className="flex flex-col gap-2">
            {members.map((m, i) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2">
                <label htmlFor={`m-${m.id}`} className="sr-only">{i === 0 ? s.yourName : s.memberName(i + 1)}</label>
                <input id={`m-${m.id}`} className="field min-w-0 flex-1" maxLength={40} value={m.name}
                  onChange={(e) => setMembers(members.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)))} />
                {i > 0 && (
                  <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink-700">
                    <input type="checkbox" className="h-5 w-5" checked={m.active === false}
                      onChange={(e) => setMembers(members.map((x) => (x.id === m.id ? { ...x, active: !e.target.checked } : x)))} />
                    {s.markLeft}
                  </label>
                )}
              </li>
            ))}
          </ul>
          {members.length < MAX_MEMBERS && (
            <button type="button" className="btn-quiet mt-2 -ml-2.5 min-h-[44px]"
              onClick={() => setMembers([...members, { id: nextId(), name: '', active: true }])}>+ {s.addMember}</button>
          )}
        </fieldset>
        <BudgetFields s={s} amount={amount} basis={basis} setAmount={setAmount} setBasis={setBasis}
          people={members.filter((m) => m.active !== false).length} />
        <div>
          <label htmlFor="start-date" className="field-label">{s.startDate}</label>
          <input id="start-date" type="date" className="field" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-brick">{error}</p>}
      </form>
    </Dialog>
  );
}
