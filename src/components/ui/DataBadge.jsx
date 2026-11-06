// Where a fact comes from, in words as well as colour. One vocabulary across the whole site,
// so "live", "estimate", "typical" and "hypothetical" can never be mistaken for each other.
import { Activity, BadgeCheck, BookOpen, Calculator, CalendarRange, FlaskConical, Gauge, HelpCircle, History } from 'lucide-react';

export const KINDS = {
  live: { label: 'Live', icon: Activity, tone: 'border-lake/30 bg-lake-50 text-lake-700', hint: 'Fetched from a live service, with the time it was checked.' },
  official: { label: 'Official', icon: BadgeCheck, tone: 'border-juniper/30 bg-juniper-50 text-juniper-700', hint: 'From an official source such as PMD or NHMP.' },
  estimate: { label: 'Estimate', icon: Calculator, tone: 'border-ochre/40 bg-ochre-50 text-ochre-700', hint: 'Worked out from Raahi’s cost assumptions. Not a quote.' },
  typical: { label: 'Typical pattern', icon: CalendarRange, tone: 'border-limestone-400 bg-limestone-200 text-ink-700', hint: 'What usually happens in this season. Not a forecast or a live status.' },
  curated: { label: 'Curated guide', icon: BookOpen, tone: 'border-limestone-400 bg-limestone-200 text-ink-700', hint: 'From Raahi’s hand-reviewed destination guide, with sources.' },
  heuristic: { label: 'Heuristic', icon: Gauge, tone: 'border-ochre/40 bg-ochre-50 text-ochre-700', hint: 'A score from documented factors. Not an official safety assessment.' },
  scenario: { label: 'Hypothetical', icon: FlaskConical, tone: 'border-iris/40 bg-iris-50 text-iris-700', hint: 'A what-if you chose. It is not a forecast or a real event.' },
  recorded: { label: 'Recorded · not live', icon: History, tone: 'border-ochre/40 bg-ochre-50 text-ochre-700', hint: 'A real run played back. It is not about your trip.' },
  unverified: { label: 'Not verified', icon: HelpCircle, tone: 'border-brick/30 bg-brick-50 text-brick', hint: 'No official live source could confirm this.' },
};

export default function DataBadge({ kind, label, title, className = '' }) {
  const k = KINDS[kind] || KINDS.typical;
  const Icon = k.icon;
  return (
    <span className={`badge ${k.tone} ${className}`} title={title || k.hint}>
      <Icon size={12} strokeWidth={2.4} aria-hidden="true" />
      {label || k.label}
    </span>
  );
}
