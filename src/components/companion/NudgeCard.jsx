// One nudge: a friendly sentence and 1–3 choices. Agents suggest; the group decides.
import { optionLabel, optionSource, nudgeText } from '../../lib/companion/i18n.js';
import { TONE } from './bits.jsx';

export default function NudgeCard({ nudge, lang, s, name, onChoose }) {
  const tone = TONE[nudge.severity] || TONE.info;
  const Icon = tone.icon;
  const text = nudge.wording?.[lang] || nudgeText(nudge, lang, name);
  const label = nudge.ruleId === 'R4' ? s.gentle : s.status[nudge.severity] || s.gentle;
  const real = nudge.options.filter((o) => !['keep', 'ok'].includes(o.kind) && o.kind !== 'fix');
  return (
    <article className={`rounded-md border p-4 ${tone.box}`} aria-label={label}>
      <p className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${tone.text}`}>
        <Icon size={14} aria-hidden="true" /> {label}
      </p>
      <p className="mt-1.5 text-[15px] leading-snug text-ink">{text}</p>
      {real.length > 0 && <p className="mt-3 text-sm font-semibold text-ink-700">{s.tomorrowOptions}</p>}
      <div className="mt-2 flex flex-col gap-2">
        {nudge.options.map((o) => {
          const quiet = ['keep', 'ok'].includes(o.kind);
          const source = optionSource(o, lang);
          return (
            <button key={o.id} type="button" onClick={() => onChoose(nudge, o)}
              className={`${quiet ? 'btn-outline' : 'btn-primary'} h-auto min-h-[44px] w-full flex-col items-start py-2 text-left`}>
              <span>{optionLabel(o, lang)}</span>
              {source && <span className="text-xs font-normal opacity-90">{source}</span>}
            </button>
          );
        })}
      </div>
    </article>
  );
}
