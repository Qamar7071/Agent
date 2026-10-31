// "Aaj": the one screen the group opens every morning and evening.
import { useState } from 'react';
import { CalendarDays, ChevronRight, MapPinned, ShieldAlert, Sunset } from 'lucide-react';
import { Link } from '../../lib/router.jsx';
import { byId } from '../../lib/data.js';
import { metres, pkr } from '../../lib/format.js';
import PaceCard from './PaceCard.jsx';
import NudgeCard from './NudgeCard.jsx';
import { CategoryIcon, Section } from './bits.jsx';

function DayPlan({ day, s, heading, id }) {
  if (!day) return null;
  return (
    <Section title={heading} id={id}>
      <p className="font-semibold">{day.title}</p>
      {day.date && <p className="text-sm text-ink-500">{day.date}</p>}
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-ink-700">
        {day.moves.filter((m) => m.depart).map((m) => (
          <li key={`${m.from_name}-${m.to_name}`} className="flex gap-2">
            <MapPinned size={16} className="mt-0.5 shrink-0 text-juniper-600" aria-hidden="true" />
            <span>{m.from_name} → {m.to_name}: {s.leave(m.depart)}{m.arrive ? `, ${s.arrive(m.arrive)}` : ''} ({m.time_label})</span>
          </li>
        ))}
        {day.activities.slice(0, 4).map((a) => <li key={a} className="pl-6">{a}</li>)}
        {day.overnight?.name && <li className="pl-6 text-ink-600">{s.stayIn(day.overnight.name)}</li>}
      </ul>
    </Section>
  );
}

/** One tip for tomorrow, from the plan and the Guardian check. Deterministic, no AI. */
export function tomorrowTip(day, guardian, s) {
  if (guardian && ['High', 'Severe'].includes(guardian.category)) return s.tips.planB;
  const early = day?.moves?.find((m) => m.depart && m.depart < '08:00');
  if (early) return s.tips.early(early.depart);
  const high = (day?.moves || []).map((m) => byId[m.to]).concat(byId[day?.destination_id] || [])
    .filter((d) => d?.altitude_m >= 3500).sort((a, b) => b.altitude_m - a.altitude_m)[0];
  if (high) return s.tips.altitude(high.name, metres(high.altitude_m));
  if (day?.moves?.length) return s.tips.cash;
  return s.tips.default;
}

export default function TodayView({ hub }) {
  const { c, p, s, lang, dayIndex, now, choose } = hub;
  const [closing, setClosing] = useState(false);
  const n = c.plan.days.length;
  const today = c.plan.days[dayIndex - 1];
  const tomorrow = c.plan.days[dayIndex];
  const name = c.settings.members[0]?.name;
  const live = c.nudges.filter((x) => !x.dismissed && Date.now() - new Date(x.createdAt) < 36 * 3600e3);
  const g = c.guardian;
  const showGuardian = g && g.day === dayIndex + 1 && ['High', 'Severe'].includes(g.category);
  const evening = now.getHours() >= 20 || closing;
  const todayExpenses = c.expenses.filter((e) => !e.deleted && e.dayIndex === Math.min(dayIndex, n));

  if (dayIndex === 0) {
    const start = new Date(`${c.settings.startDate}T00:00:00`);
    const k = Math.max(1, Math.ceil((start - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5));
    return (
      <div className="flex flex-col gap-4">
        <section className="panel p-5" aria-labelledby="pre-h">
          <CalendarDays size={22} className="text-juniper-600" aria-hidden="true" />
          <h2 id="pre-h" className="type-semiwide mt-2 text-xl font-bold">{s.beforeTrip(k)}</h2>
          <p className="mt-1 text-sm text-ink-600">{c.settings.startDate}</p>
          <p className="mt-3 text-sm text-ink-700">{s.prepaid}: {s.emptyToday}</p>
        </section>
        <PaceCard p={p} s={s} onAddBudget={hub.openSettings} />
        <DayPlan day={c.plan.days[0]} s={s} heading={s.dayN(1)} id="first-h" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PaceCard p={p} s={s} onAddBudget={hub.openSettings} />
      {live.map((x) => <NudgeCard key={x.id} nudge={x} lang={lang} s={s} name={name} onChoose={hub.onChoose} />)}
      {showGuardian && (
        <section aria-labelledby="guard-h" className="rounded-md border border-brick/40 bg-brick-50 p-4">
          <h2 id="guard-h" className="flex items-center gap-2 font-bold text-brick">
            <ShieldAlert size={18} aria-hidden="true" /> {s.guardianTitle(g.day)} · {g.category} {g.score}/100
          </h2>
          {g.factors?.length > 0 && <ul className="mt-1.5 list-disc pl-5 text-sm text-ink-700">{g.factors.map((f) => <li key={f}>{f}</li>)}</ul>}
          {g.action && <p className="mt-2 text-sm text-ink">{g.action}</p>}
          {g.alternative && <p className="mt-2 text-sm text-ink"><span className="font-semibold">{s.guardianPlanB}:</span> {g.alternative}</p>}
          <p className="mt-2 text-xs text-ink-600">{s.guardianNote}</p>
          <Link to="/guardian" className="link mt-2 inline-flex min-h-[44px] items-center">{s.guardianMore} <ChevronRight size={16} aria-hidden="true" /></Link>
        </section>
      )}
      {dayIndex <= n ? (
        <DayPlan day={today} s={s} heading={s.todayPlan} id="today-h" />
      ) : (
        <section className="panel p-5" aria-labelledby="done-h">
          <h2 id="done-h" className="type-semiwide text-xl font-bold">{s.afterTrip}</h2>
          <button type="button" className="btn-primary mt-3" onClick={() => hub.setTab('money')}>{s.settle}</button>
        </section>
      )}
      {todayExpenses.length === 0 && dayIndex <= n && <p className="text-sm text-ink-600">{s.emptyToday}</p>}
      {todayExpenses.length > 0 && (
        <ul className="panel divide-y divide-limestone-300" aria-label={s.dayN(dayIndex)}>
          {todayExpenses.slice(-4).reverse().map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => hub.edit(e)} className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-limestone/50">
                <CategoryIcon category={e.category} className="text-juniper-600" />
                <span className="min-w-0 flex-1 truncate text-sm">{e.note || s.cat[e.category]}</span>
                <span className="num font-semibold">{pkr(e.amountPkr)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {dayIndex <= n && (evening ? (
        <Section title={s.endOfDay} id="eod-h">
          <p className="num text-sm">{s.spentToday(pkr(p.perDay[dayIndex] || 0))}</p>
          {p.budgetTotal && (
            <p className="num text-sm">{s.moneyLeft(pkr(Math.max(0, p.remaining)), p.perDayLeft != null && p.daysLeft > 0 ? pkr(Math.max(0, p.perDayLeft)) : null, p.daysLeft)}</p>
          )}
          {tomorrow && <p className="mt-2 text-sm"><span className="font-semibold">{s.tomorrowPlan}:</span> {tomorrow.title}</p>}
          {tomorrow && <p className="mt-2 rounded bg-juniper-50 px-3 py-2 text-sm text-ink"><span className="font-semibold">{s.tip}:</span> {tomorrowTip(tomorrow, g?.day === dayIndex + 1 ? g : null, s)}</p>}
        </Section>
      ) : (
        <button type="button" className="btn-outline self-start" onClick={() => setClosing(true)}>
          <Sunset size={16} aria-hidden="true" /> {s.endOfDayBtn}
        </button>
      ))}
    </div>
  );
}
