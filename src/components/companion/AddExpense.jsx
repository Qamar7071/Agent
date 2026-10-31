// "+ Kharcha": add or edit an expense. Built for one thumb: a big number pad, the last category
// and payer already chosen, so a usual expense is: open → amount → Save.
import { useEffect, useMemo, useState } from 'react';
import { Delete } from 'lucide-react';
import Dialog from '../ui/Dialog.jsx';
import { lakh, pkr } from '../../lib/format.js';
import { CATEGORIES } from '../../lib/companion/pace.js';
import { MAX_AMOUNT } from '../../lib/companion/limits.js';
import { CategoryIcon } from './bits.jsx';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'back'];

export default function AddExpense({ open, onClose, onSave, onDelete, c, s, editing = null, dayIndex }) {
  const members = c.settings.members;
  const active = members.filter((m) => m.active !== false);
  const n = c.plan.days.length;
  const [digits, setDigits] = useState('');
  const [category, setCategory] = useState(c.lastCategory || 'food');
  const [paidBy, setPaidBy] = useState(c.lastPayer || active[0]?.id);
  const [split, setSplit] = useState([]);              // [] = everyone
  const [showSplit, setShowSplit] = useState(false);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [day, setDay] = useState(Math.min(dayIndex, n));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setDigits(String(editing.amountPkr));
      setCategory(editing.category);
      setPaidBy(editing.paidBy);
      setSplit(editing.splitAmong || []);
      setShowSplit(Boolean(editing.splitAmong?.length));
      setNote(editing.note || '');
      setShowNote(Boolean(editing.note));
      setDay(editing.dayIndex);
    } else {
      setDigits('');
      setCategory(c.lastCategory || 'food');
      setPaidBy(members.some((m) => m.id === c.lastPayer && m.active !== false) ? c.lastPayer : active[0]?.id);
      setSplit([]);
      setShowSplit(false);
      setNote('');
      setShowNote(false);
      setDay(Math.min(dayIndex, n));
    }
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const amount = Number(digits || 0);
  const splitIds = split.length ? split : active.map((m) => m.id);
  const press = (k) => {
    setError(null);
    if (k === 'back') return setDigits((d) => d.slice(0, -1));
    return setDigits((d) => {
      const next = (d + k).replace(/^0+/, '');
      return Number(next) > MAX_AMOUNT ? d : next;
    });
  };
  const toggleMember = (id) => {
    const set = new Set(splitIds);
    if (set.has(id) && set.size > 1) set.delete(id);
    else set.add(id);
    const list = active.map((m) => m.id).filter((x) => set.has(x));
    setSplit(list.length === active.length ? [] : list);
  };
  const submit = (e) => {
    e?.preventDefault();
    if (!amount) {
      setError(s.enterAmount);
      return;
    }
    onSave({ amountPkr: amount, category, paidBy, splitAmong: split, note: note.trim() || null, dayIndex: day });
  };

  const dayOptions = useMemo(() => Array.from({ length: n + 1 }, (_, i) => i), [n]);
  const showDay = Boolean(editing) || dayIndex === 0 || dayIndex > n;

  return (
    <Dialog open={open} onClose={onClose} title={editing ? s.edit : s.addExpense}
      footer={(
        <>
          {editing && <button type="button" className="btn-outline mr-auto text-brick" onClick={() => onDelete(editing.id)}>{s.delete}</button>}
          <button type="button" className="btn-outline" onClick={onClose}>{s.cancel}</button>
          <button type="submit" form="expense-form" className="btn-primary min-w-[96px]" disabled={!amount}>{s.save}</button>
        </>
      )}>
      <form id="expense-form" onSubmit={submit} noValidate>
        <label htmlFor="amount" className="field-label">{s.amount}</label>
        <div className="flex items-baseline gap-2 rounded-md border border-limestone-300 bg-limestone/40 px-4 py-3">
          <span className="text-2xl font-bold text-ink-600" aria-hidden="true">Rs</span>
          <input id="amount" inputMode="none" autoComplete="off" value={digits ? lakh(amount) : ''} placeholder="0"
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, '').replace(/^0+/, '');
              if (Number(d) <= MAX_AMOUNT) setDigits(d);
            }}
            aria-describedby={error ? 'amount-err' : undefined}
            className="num w-full min-w-0 bg-transparent text-4xl font-extrabold text-ink outline-none placeholder:text-ink-500" />
        </div>
        {error && <p id="amount-err" role="alert" className="mt-1 text-sm text-brick">{error}</p>}

        <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label={s.amount}>
          {KEYS.map((k) => (
            <button key={k} type="button" onClick={() => press(k)}
              className="num flex h-14 items-center justify-center rounded-md border border-limestone-300 bg-paper text-2xl font-semibold text-ink active:bg-juniper-50 hover:border-juniper-600"
              aria-label={k === 'back' ? 'Delete last digit' : k}>
              {k === 'back' ? <Delete size={24} aria-hidden="true" /> : k}
            </button>
          ))}
        </div>

        <fieldset className="mt-5">
          <legend className="field-label">{s.category}</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={s.category}>
            {CATEGORIES.map((cat) => (
              <button key={cat} type="button" role="radio" aria-checked={category === cat} onClick={() => setCategory(cat)}
                className="chip min-h-[48px] w-full justify-center px-2">
                <CategoryIcon category={cat} size={16} /> <span className="truncate">{s.cat[cat]}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {active.length > 1 && (
          <fieldset className="mt-5">
            <legend className="field-label">{s.paidBy}</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={s.paidBy}>
              {active.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={paidBy === m.id} onClick={() => setPaidBy(m.id)}
                  className="chip min-h-[44px] max-w-full"><span className="truncate">{m.name}</span></button>
              ))}
            </div>
            <button type="button" className="btn-quiet mt-2 -ml-2.5 min-h-[44px]" aria-expanded={showSplit}
              onClick={() => setShowSplit((v) => !v)}>
              {s.splitWith}: {split.length ? s.splitSome(split.length) : s.splitAll(active.length)}
            </button>
            {showSplit && (
              <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label={s.splitWith}>
                {active.map((m) => (
                  <button key={m.id} type="button" aria-pressed={splitIds.includes(m.id)} onClick={() => toggleMember(m.id)}
                    className="chip min-h-[44px] max-w-full"><span className="truncate">{m.name}</span></button>
                ))}
              </div>
            )}
          </fieldset>
        )}

        {showDay && (
          <div className="mt-5">
            <label htmlFor="expense-day" className="field-label">{s.whichDay}</label>
            <select id="expense-day" className="field" value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {dayOptions.map((i) => <option key={i} value={i}>{i === 0 ? s.prepaid : s.dayN(i)}</option>)}
            </select>
          </div>
        )}

        {showNote ? (
          <div className="mt-5">
            <label htmlFor="expense-note" className="field-label">{s.note}</label>
            <input id="expense-note" className="field" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        ) : (
          <button type="button" className="btn-quiet mt-3 -ml-2.5 min-h-[44px]" onClick={() => setShowNote(true)}>+ {s.addNote}</button>
        )}
        {amount > 0 && <p className="sr-only" aria-live="polite">{pkr(amount)}</p>}
      </form>
    </Dialog>
  );
}
