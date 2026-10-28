import { meta } from '../../lib/data.js';

const reviewed = new Date(`${meta.last_reviewed}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const rows = [
  { source: 'Open-Meteo forecast model', link: 'https://open-meteo.com/', use: 'Weather forecasts for each place, up to 16 days ahead', fresh: 'Fetched when you ask (kept for 30 minutes) and shown with the time it was checked', kind: 'Live' },
  { source: 'Pakistan Meteorological Department alert feed', link: 'https://cap-sources.s3.amazonaws.com/pk-pmd-en/rss.xml', use: 'Official weather warnings that mention Gilgit-Baltistan or the KKH', fresh: 'Fetched when you ask; each alert shows when it starts and expires', kind: 'Live, official' },
  { source: 'OpenStreetMap routing (OSRM)', link: 'https://project-osrm.org/', use: 'A second opinion on road distance', fresh: 'Free-flow driving time only: no closures, checkposts or mountain slowdowns', kind: 'Live' },
  { source: 'Raahi destination guide', link: null, use: 'Places, altitudes, seasons, access, accessibility, curated drive times and stay price ranges', fresh: `Curated by hand, last reviewed ${reviewed}. Each place lists its references.`, kind: 'Curated' },
  { source: 'Raahi cost model', link: null, use: 'Budget estimates', fresh: 'Planning assumptions, shown line by line. Not quotes.', kind: 'Estimate' },
  { source: 'NHMP travel advisory and 130 helpline', link: 'https://beta.nhmp.gov.pk/ta/Public/ViewTravel.aspx', use: 'Road status', fresh: 'Not read automatically. Raahi links you to it to check yourself.', kind: 'You check' },
];

const never = [
  'Say a road is open without official confirmation.',
  'Invent prices, availability, flight times or opening dates.',
  'Say a booking is confirmed. It can only pass on an enquiry that you send.',
  'Share your contact details with a hotel or operator without asking you first.',
];

export default function Sources() {
  return (
    <section id="sources" aria-labelledby="src-title" className="border-t border-limestone-300 bg-paper py-16 sm:py-24">
      <div className="mx-auto max-w-page px-4 sm:px-6">
        <h2 id="src-title" className="type-wide text-3xl font-extrabold sm:text-4xl">Where the information comes from</h2>
        <p className="mt-3 max-w-prose text-ink-600">Every number in a plan carries its source. This is the full list, and how fresh each one is.</p>
        <ul className="mt-8 flex flex-col divide-y divide-limestone-300 border-y border-limestone-300 md:hidden">
          {rows.map((r) => (
            <li key={r.source} className="py-4 text-sm">
              <p className="flex items-start justify-between gap-3 font-semibold">
                {r.link ? <a href={r.link} target="_blank" rel="noopener noreferrer" className="link">{r.source}</a> : r.source}
                <span className="shrink-0 rounded-sm bg-limestone-200 px-2 py-0.5 text-xs font-semibold text-ink-700">{r.kind}</span>
              </p>
              <p className="mt-1 text-ink-700">{r.use}.</p>
              <p className="mt-1 text-ink-600">{r.fresh}</p>
            </li>
          ))}
        </ul>
        <div className="mt-8 hidden md:block">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-juniper text-ink">
                <th scope="col" className="py-2 pr-4 font-semibold">Source</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Used for</th>
                <th scope="col" className="py-2 pr-4 font-semibold">How fresh</th>
                <th scope="col" className="py-2 font-semibold">Type</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.source} className="border-b border-limestone-300 align-top">
                  <th scope="row" className="py-3 pr-4 font-semibold">
                    {r.link ? <a href={r.link} target="_blank" rel="noopener noreferrer" className="link">{r.source}</a> : r.source}
                  </th>
                  <td className="py-3 pr-4 text-ink-700">{r.use}</td>
                  <td className="py-3 pr-4 text-ink-700">{r.fresh}</td>
                  <td className="py-3"><span className="whitespace-nowrap rounded-sm bg-limestone-200 px-2 py-0.5 text-xs font-semibold text-ink-700">{r.kind}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-10 max-w-prose">
          <h3 className="text-lg font-bold">What Raahi will never do</h3>
          <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-ink-700 marker:text-brick">
            {never.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
