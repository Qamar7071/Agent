// "Kharcha": totals by category against the plan, every expense by day, and the settle-up.
import { useState } from 'react';
import { AlertTriangle, Check, CloudOff, Share2 } from 'lucide-react';
import { pkr } from '../../lib/format.js';
import { CATEGORIES, PLANNED } from '../../lib/companion/pace.js';
import { summary } from '../../lib/companion/split.js';
import { CategoryIcon, Section } from './bits.jsx';

function SettleUp({ c, s }) {
  const [copied, setCopied] = useState(false);
  const members = c.settings.members;
  const name = (id) => members.find((m) => m.id === id)?.name || '?';
  const { balances, payments } = summary(c.expenses, members);
  const text = [s.shareTitle(c.title), ...payments.map((p) => `${name(p.from)} → ${name(p.to)}: ${pkr(p.amount)}`)].join('\n');
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: s.shareTitle(c.title), text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch { /* the user closed the share sheet */ }
  };
  const anySpent = balances.some((b) => b.paid > 0);
  return (
    <Section title={s.settle} id="settle-h"
      action={payments.length > 0 && (
        <button type="button" className="btn-outline -my-1" onClick={share}>
          {copied ? <Check size={16} aria-hidden="true" /> : <Share2 size={16} aria-hidden="true" />} {copied ? s.copied : s.share}
        </button>
      )}>
      <p className="text-xs text-ink-500">{s.settleHow}</p>
      {payments.length === 0 ? (
        <p className="mt-3 text-sm font-semibold text-juniper-700">{anySpent ? s.allSquare : s.noExpenses}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2" aria-label={s.settle}>
          {payments.map((p) => (
            <li key={`${p.from}-${p.to}`} className="flex items-center justify-between gap-3 rounded border border-limestone-300 px-3 py-2.5">
              <span className="min-w-0 truncate text-sm font-semibold">{s.pays(name(p.from), name(p.to))}</span>
              <span className="num shrink-0 font-bold">{pkr(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {anySpent && (
        <ul className="mt-4 divide-y divide-limestone-300 text-sm">
          {balances.map((b) => {
            const m = members.find((x) => x.id === b.id);
            return (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2">
                <span className="min-w-0 truncate font-medium">{m?.name}{m?.active === false ? ` (${s.left})` : ''}</span>
                <span className="num text-ink-600">{s.paidShare(pkr(b.paid), pkr(b.share))}</span>
                <span className={`num w-full text-right font-semibold sm:w-auto ${b.net > 0 ? 'text-juniper-700' : b.net < 0 ? 'text-brick' : 'text-ink-600'}`}>
                  {b.net > 0 ? '+' : ''}{pkr(b.net)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

export default function MoneyView({ hub }) {
  const { c, p, s } = hub;
  const live = c.expenses.filter((e) => !e.deleted);
  const days = [...new Set(live.map((e) => e.dayIndex))].sort((a, b) => b - a);
  const payer = (id) => c.settings.members.find((m) => m.id === id)?.name || '?';
  const max = Math.max(1, ...p.byCategory.map((x) => Math.max(x.spentAll, x.plannedToDateScaled || 0)));
  return (
    <div className="flex flex-col gap-4">
      <Section title={s.byCategory} id="cat-h">
        <p className="num text-2xl font-extrabold">{pkr(p.spentAll)}<span className="ml-2 text-sm font-semibold text-ink-500">{s.total}</span></p>
        <ul className="mt-3 flex flex-col gap-3">
          {CATEGORIES.filter((cat) => PLANNED.includes(cat) || p.byCategory.find((x) => x.category === cat).spentAll > 0).map((cat) => {
            const x = p.byCategory.find((y) => y.category === cat);
            const planned = p.budgetTotal ? x.plannedToDateScaled : null;
            return (
              <li key={cat}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 font-medium"><CategoryIcon category={cat} size={16} className="text-juniper-600" />{s.cat[cat]}</span>
                  <span className="num font-semibold">{pkr(x.spentAll)}</span>
                </div>
                <div className="relative mt-1 h-2 rounded-full bg-limestone-300" aria-hidden="true">
                  <div className={`h-2 rounded-full ${planned && x.spentToDate > planned * 1.1 ? 'bg-ochre' : 'bg-juniper-600'}`}
                    style={{ width: `${Math.min(100, (x.spentAll / max) * 100)}%` }} />
                  {planned > 0 && <div className="absolute -top-1 h-4 w-0.5 bg-ink" style={{ left: `${Math.min(100, (planned / max) * 100)}%` }} />}
                </div>
                <p className="mt-0.5 text-xs text-ink-500">{planned != null && PLANNED.includes(cat) ? s.planShare(pkr(planned)) : !PLANNED.includes(cat) ? s.noPlanShare : ''}</p>
              </li>
            );
          })}
        </ul>
      </Section>

      <SettleUp c={c} s={s} />

      <Section title={s.allExpenses} id="all-h">
        {days.length === 0 && <p className="text-sm text-ink-600">{s.emptyToday}</p>}
        {days.map((d) => (
          <div key={d} className="mt-3 first:mt-0">
            <h3 className="flex justify-between text-sm font-semibold text-ink-600">
              <span>{s.dayN(d)}</span><span className="num">{pkr(p.perDay[d] || 0)}</span>
            </h3>
            <ul className="mt-1 divide-y divide-limestone-300 rounded border border-limestone-300">
              {live.filter((e) => e.dayIndex === d).reverse().map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => hub.edit(e)} aria-label={`${s.edit}: ${pkr(e.amountPkr)} ${s.cat[e.category]}`}
                    className="flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left hover:bg-limestone/50">
                    <CategoryIcon category={e.category} className="shrink-0 text-juniper-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{e.note || s.cat[e.category]}</span>
                      <span className="block truncate text-xs text-ink-500">{payer(e.paidBy)}{e.splitAmong?.length ? ` · ${s.splitSome(e.splitAmong.length)}` : ''}</span>
                    </span>
                    <span className="num shrink-0 font-semibold">{pkr(e.amountPkr)}</span>
                    {e.syncStatus === 'pending' && <CloudOff size={14} className="shrink-0 text-ink-500" aria-label={s.pending(1)} />}
                    {e.syncStatus === 'rejected' && <AlertTriangle size={14} className="shrink-0 text-brick" aria-label={e.syncError || s.syncFailed} />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Section>
    </div>
  );
}
