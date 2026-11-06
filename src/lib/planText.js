// A plan as plain text, to copy into WhatsApp, notes or an email. Pure, unit-tested.
import { pkr } from './format.js';

const MODE = { drive: 'by road', jeep: 'by jeep track', flight: 'by air', trek: 'on foot' };

function dateLabel(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function planToText(plan, { site = '' } = {}) {
  if (!plan?.days?.length) return '';
  const r = plan.request || {};
  const people = (r.adults || 0) + (r.children || 0);
  const lines = [
    `${plan.title}: ${plan.days.length} days${r.origin ? ` from ${r.origin}` : ''}${people ? `, ${people} ${people === 1 ? 'person' : 'people'}` : ''}`,
  ];
  if (plan.budget?.total) {
    lines.push(`Estimated cost: ${pkr(plan.budget.total)}${plan.budget.per_person ? ` (${pkr(plan.budget.per_person)} per person)` : ''}. An estimate, not a quote.`);
  }
  lines.push('');
  for (const d of plan.days) {
    const when = dateLabel(d.date);
    lines.push(`Day ${d.day}${when ? ` (${when})` : ''}: ${d.title}`);
    for (const m of d.moves || []) {
      const how = MODE[m.mode] || '';
      const time = m.time_label ? `, ${m.time_label}` : '';
      lines.push(m.round_trip
        ? `  Day trip from ${m.from_name}${time} each way ${how}`.trimEnd()
        : `  ${m.from_name} to ${m.to_name}${time} ${how}`.trimEnd());
    }
    if (d.activities?.length && !d.activities_auto) lines.push(`  ${d.activities.slice(0, 4).join('; ')}`);
    if (d.overnight?.name) lines.push(`  Night in ${d.overnight.name}`);
  }
  lines.push('');
  lines.push('Road status could not be verified: check NHMP (130) on the morning you travel.');
  lines.push(`Planned with Raahi${site ? `: ${site}` : ''}`);
  return lines.join('\n');
}
