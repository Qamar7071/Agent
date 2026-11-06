import { Suspense, lazy, useEffect } from 'react';
import { usePageMeta } from '../lib/seo.js';
import { useRouter } from '../lib/router.jsx';
import Hero from '../components/home/Hero.jsx';
import DestinationIndex from '../components/home/DestinationIndex.jsx';
import HowItWorks from '../components/home/HowItWorks.jsx';

// Below the first screens: loaded on demand so they don't slow down the hero.
const WhereCanWeGo = lazy(() => import('../components/home/WhereCanWeGo.jsx'));
const AgentShowcase = lazy(() => import('../components/home/AgentShowcase.jsx'));
const Together = lazy(() => import('../components/home/Together.jsx'));
const TwinGuardian = lazy(() => import('../components/home/TwinGuardian.jsx'));
const LiveConditions = lazy(() => import('../components/home/LiveConditions.jsx'));
const WhyRaahi = lazy(() => import('../components/home/WhyRaahi.jsx'));
const EnquiryCta = lazy(() => import('../components/home/EnquiryCta.jsx'));

const Placeholder = ({ h = 'min-h-[40rem]', dark = false }) => (
  <div className={`${h} ${dark ? 'bg-juniper-950' : ''}`} aria-hidden="true" />
);

// The homepage, in the order a traveller thinks: where could I go, can I afford it, how does
// planning work, who does the work, travelling together, testing the plan, live conditions,
// why trust it, and a last call to action.
export default function Home() {
  usePageMeta({
    description: 'Raahi, the AI travel companion for Northern Pakistan: plan Hunza, Skardu, Fairy Meadows, Deosai and the Karakoram Highway in English or Roman Urdu, with drive days, live forecasts, honest costs and a team of specialist agents.',
    path: '/',
  });
  const { hash } = useRouter();
  useEffect(() => {
    if (!hash) return undefined;
    // Sections below the fold load on demand: try again briefly until the target exists.
    let tries = 0;
    const t = setInterval(() => {
      const el = document.getElementById(hash.slice(1));
      tries += 1;
      if (el || tries > 20) {
        clearInterval(t);
        el?.scrollIntoView({ block: 'start' });
      }
    }, 100);
    return () => clearInterval(t);
  }, [hash]);
  return (
    <main id="main">
      <Hero />
      <DestinationIndex />
      <Suspense fallback={<Placeholder />}><WhereCanWeGo /></Suspense>
      <HowItWorks />
      <Suspense fallback={<Placeholder h="min-h-[70rem]" dark />}><AgentShowcase /></Suspense>
      <Suspense fallback={<Placeholder h="min-h-[60rem]" />}><Together /></Suspense>
      <Suspense fallback={<Placeholder h="min-h-[60rem]" dark />}><TwinGuardian /></Suspense>
      <Suspense fallback={<Placeholder />}><LiveConditions /></Suspense>
      <Suspense fallback={<Placeholder h="min-h-[60rem]" />}><WhyRaahi /></Suspense>
      <Suspense fallback={<Placeholder h="min-h-[30rem]" dark />}><EnquiryCta /></Suspense>
    </main>
  );
}
