import { Link } from '../lib/router.jsx';
import { usePageMeta } from '../lib/seo.js';

export default function NotFound() {
  usePageMeta({ title: 'Page not found', noindex: true });
  return (
    <main id="main" className="mx-auto mt-16 flex min-h-[70vh] max-w-page flex-col items-start justify-center gap-4 px-4 py-20 sm:px-6">
      <h1 className="type-wide text-4xl font-extrabold">This page isn’t on the map</h1>
      <p className="max-w-prose text-ink-600">The link may be old or mistyped. Start from the home page or go straight to the planner.</p>
      <div className="flex gap-2">
        <Link to="/" className="btn-outline">Home</Link>
        <Link to="/plan" className="btn-primary">Plan a trip</Link>
      </div>
    </main>
  );
}
