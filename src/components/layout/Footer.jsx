import { Link } from '../../lib/router.jsx';
import { destinations, meta } from '../../lib/data.js';
import { photos } from '../../data/photos.js';
import Logo from '../ui/Logo.jsx';

const emergency = [
  { label: 'Rescue', number: '1122' },
  { label: 'Police', number: '15' },
  { label: 'Highway police (NHMP)', number: '130' },
];

export default function Footer() {
  return (
    <footer className="on-dark bg-juniper-950 text-white/80">
      <div className="mx-auto grid max-w-page gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div className="flex max-w-sm flex-col gap-4">
          <Logo />
          <p className="text-sm leading-relaxed">
            Raahi plans trips to Gilgit-Baltistan and the Karakoram Highway. It gives planning estimates and links to
            official sources. It does not sell tickets or make bookings.
          </p>
          <p className="text-sm">Destination guide last reviewed {new Date(`${meta.last_reviewed}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Plan</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li><Link to="/plan" className="hover:text-white hover:underline">Trip planner</Link></li>
            <li><Link to="/trips" className="hover:text-white hover:underline">My trips and enquiries</Link></li>
            <li><Link to="/#conditions" className="hover:text-white hover:underline">Weather and roads</Link></li>
            <li><Link to="/#sources" className="hover:text-white hover:underline">Where our information comes from</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Destinations</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {destinations.map((d) => (
              <li key={d.id}><Link to={`/destinations/${d.id}`} className="hover:text-white hover:underline">{d.name}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">In an emergency</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {emergency.map((e) => (
              <li key={e.number} className="flex justify-between gap-4">
                <span>{e.label}</span>
                <a href={`tel:${e.number}`} className="num font-semibold text-white hover:underline">{e.number}</a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-white/65">Mobile signal drops between valleys. Save your hotel’s and driver’s numbers too.</p>
        </div>
      </div>
      <div className="mx-auto max-w-page border-t border-white/10 px-4 py-6 text-xs leading-relaxed text-white/65 sm:px-6">
        <details>
          <summary className="cursor-pointer text-white/80 hover:text-white">Photo credits</summary>
          <ul className="mt-3 grid gap-1 sm:grid-cols-2">
            {Object.entries(photos).map(([id, p]) => (
              <li key={id}>{p.place}: {p.credit ? `${p.credit} (name taken from the image file)` : 'photographer not recorded in the image file'}</li>
            ))}
          </ul>
          <p className="mt-2">If you took one of these photos and want it credited differently or removed, please get in touch through the project’s GitHub page.</p>
        </details>
        <p className="mt-4">© {new Date().getFullYear()} Raahi. Forecasts: Open-Meteo. Official alerts: Pakistan Meteorological Department. Maps: OpenStreetMap contributors, Google Maps links.</p>
      </div>
    </footer>
  );
}
