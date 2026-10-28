import { Check } from 'lucide-react';
import { Link } from '../../lib/router.jsx';

const can = [
  'Puts your stops in road order, with overnight stops and departure times worked out from daylight.',
  'Checks the forecast for your dates and the official PMD weather alerts, and tells you when it can’t.',
  'Explains what is and isn’t known about the roads. It never claims a road is open.',
  'Estimates the cost line by line in rupees, compares it with your budget and shows where to save.',
  'Changes the plan when you ask (“one day less”, “add Deosai”) and keeps your other choices.',
  'Saves the trip, or sends a booking enquiry, only when you ask it to.',
];

export default function AgentIntro() {
  return (
    <section aria-labelledby="agent-title" className="border-y border-limestone-300 bg-paper py-16 sm:py-24">
      <div className="mx-auto grid max-w-page gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <div>
          <h2 id="agent-title" className="type-wide text-3xl font-extrabold sm:text-4xl">Ask in your own words</h2>
          <p className="mt-3 max-w-prose text-ink-600">
            Write the way you’d text a friend, in English or Roman Urdu. Raahi asks only what it needs, then uses its
            tools: the road network, the season calendar, the forecast, official alerts and the cost model.
          </p>
          <ul className="mt-6 flex flex-col gap-3">
            {can.map((c) => (
              <li key={c} className="flex gap-3">
                <Check size={18} className="mt-1 shrink-0 text-juniper-600" aria-hidden="true" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
          <Link to="/plan" className="btn-primary mt-8 px-6">Open the planner</Link>
        </div>

        <figure className="self-start rounded-md border border-limestone-300 bg-limestone p-5 sm:p-6">
          <figcaption className="text-sm text-ink-600">Example conversation (from Raahi’s own planner rules)</figcaption>
          <div className="mt-4 flex flex-col gap-4 text-[15px]">
            <p className="ml-auto max-w-[85%] rounded-md rounded-tr-sm bg-juniper px-4 py-2.5 text-white">
              Hunza jana hai 6 din ke liye, Lahore se. Hum 2 log hain, budget 1.5 lakh.
            </p>
            <ol className="flex flex-col gap-1.5 text-sm text-ink-600" aria-label="What Raahi checked">
              <li className="flex gap-2"><span className="num text-juniper-600">1</span> Route: Lahore, Islamabad, Chilas, Karimabad</li>
              <li className="flex gap-2"><span className="num text-juniper-600">2</span> Drive days: 3 each way by road</li>
              <li className="flex gap-2"><span className="num text-juniper-600">3</span> Cost model: road and flight options</li>
            </ol>
            <div className="max-w-[92%] rounded-md rounded-tl-sm border border-limestone-300 bg-paper px-4 py-3 text-ink-700">
              <p>
                Six days isn’t enough by road from Lahore: the drive via Islamabad and an overnight in Chilas takes about
                three days each way, so you’d need at least seven days for even one day in Hunza.
              </p>
              <p className="mt-2">
                If you fly to Gilgit you get three full days in Hunza and a spare day in case the flight is delayed.
                Both options cost more than PKR 150,000 for two; the Budget tab shows where to save. Shall I plan the
                flight version?
              </p>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}
