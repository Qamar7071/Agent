import { Link } from '../../lib/router.jsx';
import { usePlanner } from '../../context/PlannerContext.jsx';
import Photo from '../ui/Photo.jsx';
import { creditLine, photos } from '../../data/photos.js';

export default function EnquiryCta() {
  const { health } = usePlanner();
  const closed = health && !health.enquiries_open;
  return (
    <section aria-labelledby="enq-title" className="bg-limestone py-16 sm:py-24">
      <div className="mx-auto grid max-w-page items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
        <figure>
          <div className="aspect-[4/3] overflow-hidden rounded">
            <Photo id="fairy-meadows" sizes="(min-width: 1024px) 600px, (min-resolution: 2.5dppx) 61vw, 92vw" position="50% 40%" />
          </div>
          <figcaption className="mt-2 text-xs text-ink-500">{photos['fairy-meadows'].place}. {creditLine('fairy-meadows')}.</figcaption>
        </figure>
        <div>
          <h2 id="enq-title" className="type-wide text-3xl font-extrabold sm:text-4xl">Want help arranging it?</h2>
          <p className="mt-4 max-w-prose text-ink-700">
            When the plan looks right, send it from the planner as a booking enquiry. A person reads every enquiry and
            replies by email, phone or WhatsApp, whichever you choose.
          </p>
          <ul className="mt-4 flex max-w-prose list-disc flex-col gap-1.5 pl-5 text-ink-700 marker:text-juniper-500">
            <li>An enquiry is not a booking. Nothing is reserved or paid until you agree it directly with a hotel or operator.</li>
            <li>You choose what to share, and you can withdraw the enquiry at any time.</li>
            <li>Prices in your plan are estimates; real quotes come back with the reply.</li>
          </ul>
          {closed && (
            <p className="mt-4 max-w-prose rounded border border-ochre/40 bg-ochre-50 px-3 py-2 text-sm text-ink-700">
              Enquiries aren’t open on this website yet. You can still plan and save trips.
            </p>
          )}
          <Link to="/plan" className="btn-primary mt-7 px-6">Start a plan</Link>
        </div>
      </div>
    </section>
  );
}
