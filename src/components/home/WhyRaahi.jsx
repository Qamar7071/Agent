// Home: "Why travel with Raahi?" What Raahi stands on, where each piece of information comes
// from and how fresh it is, and what it will never do.
import { Activity, Calculator, ExternalLink, KeyRound, MessagesSquare, Route, ShieldX, Signpost } from 'lucide-react';
import { meta } from '../../lib/data.js';
import DataBadge from '../ui/DataBadge.jsx';
import SectionHeader from '../ui/SectionHeader.jsx';
import Reveal from '../ui/Reveal.jsx';

const reviewed = new Date(`${meta.last_reviewed}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const principles = [
  { icon: Route, title: 'Planned around the real road', text: 'Curated drive times, overnight halts, departures set by daylight, and spare days for the mountains.' },
  { icon: Signpost, title: 'Honest about roads', text: 'No public live feed exists for Gilgit-Baltistan, so Raahi never calls a road open. It points you to NHMP (130) instead.' },
  { icon: Activity, title: 'Live where it can be', text: 'Open-Meteo forecasts and official PMD alerts are fetched when you ask, and always shown with the time they were checked.' },
  { icon: Calculator, title: 'Estimates you can audit', text: 'Every rupee is a line you can read: transport, stays, food, entries and a contingency. Estimates, never quotes.' },
  { icon: MessagesSquare, title: 'Agents you can question', text: 'Open any run and see which agent did what, what it worried about, what it decided and on what evidence.' },
  { icon: KeyRound, title: 'Your trip stays yours', text: 'No accounts. Private keys stay in your browser, comfort needs are shared without names, and nothing is booked or sent without you.' },
];

const rows = [
  { source: 'Open-Meteo forecast model', link: 'https://open-meteo.com/', use: 'Weather forecasts for each place, up to 16 days ahead', fresh: 'Fetched when you ask (kept for 30 minutes) and shown with the time it was checked', kind: 'live' },
  { source: 'Pakistan Meteorological Department alert feed', link: 'https://cap-sources.s3.amazonaws.com/pk-pmd-en/rss.xml', use: 'Official weather warnings that mention Gilgit-Baltistan or the KKH', fresh: 'Fetched when you ask; each alert shows when it starts and expires', kind: 'official' },
  { source: 'OpenStreetMap routing (OSRM)', link: 'https://project-osrm.org/', use: 'A second opinion on road distance', fresh: 'Free-flow driving time only: no closures, checkposts or mountain slowdowns', kind: 'live' },
  { source: 'Raahi destination guide', link: null, use: 'Places, altitudes, seasons, access, accessibility, curated drive times and stay price ranges', fresh: `Curated by hand, last reviewed ${reviewed}. Each place lists its references.`, kind: 'curated' },
  { source: 'Raahi cost model', link: null, use: 'Budget estimates', fresh: 'Planning assumptions, shown line by line. Not quotes.', kind: 'estimate' },
  { source: 'NHMP travel advisory and 130 helpline', link: 'https://beta.nhmp.gov.pk/ta/Public/ViewTravel.aspx', use: 'Road status', fresh: 'Not read automatically. Raahi links you to it to check yourself.', kind: 'unverified', label: 'You check' },
];

const never = [
  'Say a road is open without official confirmation.',
  'Invent prices, availability, flight times or opening dates.',
  'Say a booking is confirmed. It can only pass on an enquiry that you send.',
  'Share your contact details with a hotel or operator without asking you first.',
];

function SourceName({ r }) {
  return r.link
    ? <a href={r.link} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">{r.source}<ExternalLink size={12} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
    : r.source;
}

export default function WhyRaahi() {
  return (
    <section id="why" aria-labelledby="why-title" className="bg-paper py-16 sm:py-24">
      <div className="mx-auto max-w-page px-4 sm:px-6">
        <Reveal>
          <SectionHeader id="why-title" eyebrow="Why travel with Raahi" title="Built on what is true, not what sounds good">
            Mountain travel punishes wishful thinking. So Raahi tells you what it knows, how it knows it, and what it can’t
            know, every time.
          </SectionHeader>
        </Reveal>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {principles.map((p, i) => {
            const Icon = p.icon;
            return (
              <Reveal as="li" key={p.title} delay={(i % 3) * 70} className="card card-hover p-5 sm:p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-juniper-50 text-juniper-700" aria-hidden="true"><Icon size={20} /></span>
                <h3 className="mt-4 text-lg font-bold">{p.title}</h3>
                <p className="mt-1.5 text-ink-600">{p.text}</p>
              </Reveal>
            );
          })}
        </ul>

        <div id="sources" className="mt-16 scroll-mt-24">
          <h3 className="type-semiwide text-2xl font-extrabold">Where the information comes from</h3>
          <p className="mt-2 max-w-prose text-ink-600">Every number in a plan carries its source. This is the full list, and how fresh each one is.</p>
          <ul className="mt-6 flex flex-col divide-y divide-limestone-300 rounded-2xl border border-limestone-300 md:hidden">
            {rows.map((r) => (
              <li key={r.source} className="p-4 text-sm">
                <p className="flex items-start justify-between gap-3 font-semibold"><span><SourceName r={r} /></span><DataBadge kind={r.kind} label={r.label} /></p>
                <p className="mt-1 text-ink-700">{r.use}.</p>
                <p className="mt-1 text-ink-600">{r.fresh}</p>
              </li>
            ))}
          </ul>
          <div className="mt-6 hidden overflow-hidden rounded-2xl border border-limestone-300 md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-limestone/70">
                <tr className="text-ink">
                  <th scope="col" className="px-4 py-3 font-semibold">Source</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Used for</th>
                  <th scope="col" className="px-4 py-3 font-semibold">How fresh</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.source} className="border-t border-limestone-300 align-top">
                    <th scope="row" className="px-4 py-3 font-semibold"><SourceName r={r} /></th>
                    <td className="px-4 py-3 text-ink-700">{r.use}</td>
                    <td className="px-4 py-3 text-ink-700">{r.fresh}</td>
                    <td className="px-4 py-3"><DataBadge kind={r.kind} label={r.label} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-12 rounded-2xl border border-brick/25 bg-brick-50 p-5 sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-bold"><ShieldX size={20} className="text-brick" aria-hidden="true" /> What Raahi will never do</h3>
          <ul className="mt-3 grid gap-2 text-ink-700 sm:grid-cols-2">
            {never.map((n) => <li key={n} className="flex gap-2"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brick" />{n}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
