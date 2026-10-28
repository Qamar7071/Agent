import { Suspense, lazy } from 'react';
import { PlannerProvider } from './context/PlannerContext.jsx';
import { RouterProvider, match, useRouter } from './lib/router.jsx';
import Navbar from './components/layout/Navbar.jsx';
import Footer from './components/layout/Footer.jsx';
import Home from './pages/Home.jsx';
import NotFound from './pages/NotFound.jsx';

// Pages other than the home page load on demand, so the first visit downloads less.
const Plan = lazy(() => import('./pages/Plan.jsx'));
const Trips = lazy(() => import('./pages/Trips.jsx'));
const Destination = lazy(() => import('./pages/Destination.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));

function Loading() {
  return (
    <main id="main" className="mx-auto mt-16 min-h-[70vh] max-w-page px-4 py-16 sm:px-6">
      <p className="text-ink-600" role="status">Loading…</p>
    </main>
  );
}

function Page() {
  const { path } = useRouter();
  if (path === '/') return <Home />;
  if (path === '/plan') return <Plan />;
  if (path === '/trips') return <Trips />;
  if (path === '/admin') return <Admin />;
  const dest = match('/destinations/:id', path);
  if (dest) return <Destination id={dest.id} />;
  return <NotFound />;
}

function Layout() {
  const { path } = useRouter();
  return (
    <>
      <Navbar />
      <Suspense fallback={<Loading />}>
        <Page />
      </Suspense>
      {path !== '/plan' && <Footer />}
    </>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <PlannerProvider>
        <Layout />
      </PlannerProvider>
    </RouterProvider>
  );
}
