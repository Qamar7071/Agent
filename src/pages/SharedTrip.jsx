// /s/<key>: what family at home sees. The towns the group sleeps in, night by night, tonight
// first; what a gap in contact usually means; and who to call. In English or Roman Urdu.
// It is the plan, not a live location, and the page says so.
import { useEffect, useState } from 'react';
import { BedDouble, Moon, Phone, ShieldAlert, Signal } from 'lucide-react';
import { api } from '../lib/api.js';
import { usePageMeta } from '../lib/seo.js';
import { useLang } from '../lib/useLang.js';
import { LanguageSwitch } from '../components/companion/TripSettings.jsx';
import Notice from '../components/ui/Notice.jsx';

const STR = {
  en: {
    title: 'Where we’ll be',
    intro: 'This page shows the trip plan: the town the group sleeps in each night. It is not a live location; Raahi doesn’t track anyone.',
    tonight: 'Tonight', tomorrow: 'Tomorrow night', next: 'Next night', before: 'Not started yet', after: 'Trip finished',
    starts: (d) => `The trip starts on ${d}.`,
    ended: (d) => `The plan ended on ${d}.`,
    night: (n) => `Night in ${n}`, home: 'Home, or on the road home',
    day: (n) => `Day ${n}`,
    noDates: 'No dates yet: the nights are listed in order.',
    note: 'A note from the traveller',
    signalTitle: 'If you can’t reach them',
    signal: 'Mobile signal drops between valleys and on the high passes. A few hours without contact on a travel day is normal. Wait until the evening, when they should be in the town listed for tonight.',
    call: 'If you are worried, call:',
    rescue: 'Rescue', police: 'Police', nhmp: 'Highway police (NHMP)',
    updated: (d) => `Plan last saved ${d}.`,
    gone: 'This link has been stopped or replaced. Ask the traveller for a new one.',
    off: 'Raahi’s server is not keeping trips right now, so this page can’t be shown.',
    loading: 'Loading the plan…', language: 'Language',
  },
  ur: {
    title: 'Hum kahan honge',
    intro: 'Is page par trip ka plan hai: har raat group kis shehar mein soyega. Yeh live location nahi; Raahi kisi ko track nahi karta.',
    tonight: 'Aaj raat', tomorrow: 'Kal raat', next: 'Agli raat', before: 'Trip abhi shuru nahi hui', after: 'Trip khatam',
    starts: (d) => `Trip ${d} ko shuru hogi.`,
    ended: (d) => `Plan ${d} ko khatam hua.`,
    night: (n) => `Raat: ${n}`, home: 'Ghar, ya ghar wapsi ke raaste mein',
    day: (n) => `Din ${n}`,
    noDates: 'Abhi tareekhen nahi: raatein tarteeb se likhi hain.',
    note: 'Musafir ka note',
    signalTitle: 'Agar rabta na ho sake',
    signal: 'Wadiyon ke darmiyan aur oonche passes par mobile signal chala jata hai. Safar ke din kuch ghante rabta na hona aam baat hai. Shaam tak intezar karein, jab woh aaj raat wale shehar mein honge.',
    call: 'Agar fikr ho to call karein:',
    rescue: 'Rescue', police: 'Police', nhmp: 'Highway police (NHMP)',
    updated: (d) => `Plan aakhri baar ${d} ko save hua.`,
    gone: 'Yeh link band ya tabdeel ho chuka. Musafir se naya link maangein.',
    off: 'Raahi ka server abhi trips nahi rakh raha, is liye yeh page nahi dikh sakta.',
    loading: 'Plan load ho raha hai…', language: 'Zabaan',
  },
};

// Today's date in Pakistan, whatever the viewer's time zone.
const todayPk = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
const nice = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export default function SharedTrip({ share }) {
  const [lang, setLang] = useLang();
  const s = STR[lang] || STR.en;
  usePageMeta({ title: s.title, path: '/s', noindex: true });
  const [res, setRes] = useState({ state: 'loading' });
  useEffect(() => {
    api.shareGet(share).then((data) => setRes({ state: 'ready', data }))
      .catch((error) => setRes({ state: 'error', error }));
  }, [share]);

  const today = todayPk();
  const v = res.data;
  const days = v?.days || [];
  const idx = v?.start_date ? days.findIndex((d) => d.date === today) : -1;
  const before = v?.start_date && today < v.start_date;
  const after = v?.start_date && days.length && today > days[days.length - 1].date;
  const label = (i) => (idx === -1 ? null : i === idx ? s.tonight : i === idx + 1 ? s.tomorrow : null);

  return (
    <main id="main" className="mx-auto mt-16 min-h-[70vh] w-full max-w-2xl px-4 pb-20 pt-8 sm:px-6">
      <div className="flex justify-end"><LanguageSwitch value={lang} onChange={setLang} label={s.language} /></div>
      {res.state === 'loading' && <p className="mt-8 text-ink-600" role="status">{s.loading}</p>}
      {res.state === 'error' && (
        <Notice level="warning" className="mt-8">{res.error.status === 503 ? s.off : res.error.status === 404 ? s.gone : res.error.message}</Notice>
      )}
      {res.state === 'ready' && (
        <>
          <p className="mt-2 text-sm font-semibold text-juniper-600">{v.title}</p>
          <h1 className="type-wide mt-1 text-3xl font-extrabold sm:text-4xl">{s.title}</h1>
          <p className="mt-2 text-ink-600">{s.intro}</p>

          {idx >= 0 && (
            <section aria-labelledby="tonight-h" className="mt-6 rounded-lg bg-juniper-950 p-5 text-white">
              <h2 id="tonight-h" className="flex items-center gap-2 text-sm font-semibold text-white/80"><Moon size={16} aria-hidden="true" /> {s.tonight}, {nice(days[idx].date)}</h2>
              <p className="type-wide mt-1 text-2xl font-extrabold">{days[idx].night || s.home}</p>
              <p className="mt-1 text-white/80">{s.day(days[idx].day)}: {days[idx].title}</p>
            </section>
          )}
          {before && <Notice level="info" className="mt-6">{s.before}. {s.starts(nice(v.start_date))}</Notice>}
          {after && <Notice level="info" className="mt-6">{s.after}. {s.ended(nice(days[days.length - 1].date))}</Notice>}
          {!v.start_date && <p className="mt-6 text-sm text-ink-600">{s.noDates}</p>}

          {v.note && (
            <section aria-labelledby="note-h" className="mt-6 rounded-md border border-limestone-300 bg-paper p-4">
              <h2 id="note-h" className="text-sm font-semibold text-ink-600">{s.note}</h2>
              <p className="mt-1 whitespace-pre-wrap break-words">{v.note}</p>
            </section>
          )}

          <ol className="mt-6 flex flex-col">
            {days.map((d, i) => {
              const tag = label(i);
              return (
                <li key={d.day} className={`flex gap-3 border-l-2 py-3 pl-4 ${i === idx ? 'border-juniper-600' : 'border-limestone-300'} ${idx >= 0 && i < idx ? 'opacity-60' : ''}`}>
                  <BedDouble size={18} className="mt-0.5 shrink-0 text-juniper-600" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm text-ink-600">
                      {s.day(d.day)}{d.date ? `, ${nice(d.date)}` : ''}{tag && <span className="ml-2 rounded-full bg-juniper-50 px-2 py-0.5 text-xs font-semibold text-juniper-700">{tag}</span>}
                    </p>
                    <p className="font-semibold">{d.night ? s.night(d.night) : s.home}</p>
                    <p className="text-sm text-ink-600">{d.title}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          <section aria-labelledby="signal-h" className="mt-8 rounded-lg border border-limestone-300 bg-paper p-5">
            <h2 id="signal-h" className="flex items-center gap-2 font-bold"><Signal size={18} aria-hidden="true" /> {s.signalTitle}</h2>
            <p className="mt-1 text-ink-700">{s.signal}</p>
            <p className="mt-3 flex items-center gap-2 font-semibold"><ShieldAlert size={16} aria-hidden="true" /> {s.call}</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-3">
              {[['1122', s.rescue], ['15', s.police], ['130', s.nhmp]].map(([n, l]) => (
                <li key={n}>
                  <a href={`tel:${n}`} className="btn-outline flex min-h-[52px] w-full items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><Phone size={16} aria-hidden="true" /> {l}</span><span className="num font-bold">{n}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
          {v.updated_at && <p className="mt-4 text-xs text-ink-500">{s.updated(new Date(v.updated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</p>}
        </>
      )}
    </main>
  );
}
