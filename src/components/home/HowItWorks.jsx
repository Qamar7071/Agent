import { Link } from '../../lib/router.jsx';

const steps = [
  {
    title: 'Describe the trip',
    text: 'Where you want to go, how many days, who is coming, roughly when and what you want to spend. Or fill in the trip form.',
  },
  {
    title: 'Raahi checks it',
    text: 'It orders the stops along the road, adds overnight stops and spare days, checks the season for your month and the forecast for your dates.',
  },
  {
    title: 'Get a day-by-day plan',
    text: 'Departure times, drive times, where you sleep, what to do if the weather turns, risks to know, and a cost estimate with every assumption shown.',
  },
  {
    title: 'Adjust, save or enquire',
    text: 'Change anything by asking or editing a day. Save the trip to come back to it, or send it as an enquiry when you want help arranging it.',
  },
];

export default function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="py-16 sm:py-24">
      <div className="mx-auto max-w-page px-4 sm:px-6">
        <h2 id="how-title" className="type-wide text-3xl font-extrabold sm:text-4xl">How it works</h2>
        <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="border-t-2 border-juniper pt-4">
              <span className="num type-wide text-3xl font-extrabold text-apricot" aria-hidden="true">{i + 1}</span>
              <h3 className="mt-2 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-ink-600">{s.text}</p>
            </li>
          ))}
        </ol>
        <Link to="/plan" className="btn-primary mt-10 px-6">Start planning</Link>
      </div>
    </section>
  );
}
