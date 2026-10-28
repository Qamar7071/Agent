import { useEffect } from 'react';
import { usePageMeta } from '../lib/seo.js';
import { useRouter } from '../lib/router.jsx';
import Hero from '../components/home/Hero.jsx';
import DestinationIndex from '../components/home/DestinationIndex.jsx';
import AgentIntro from '../components/home/AgentIntro.jsx';
import LiveConditions from '../components/home/LiveConditions.jsx';
import HowItWorks from '../components/home/HowItWorks.jsx';
import Sources from '../components/home/Sources.jsx';
import EnquiryCta from '../components/home/EnquiryCta.jsx';

export default function Home() {
  usePageMeta({
    description: 'Plan a realistic trip to Hunza, Skardu, Fairy Meadows, Deosai and the Karakoram Highway: drive days, overnight stops, season checks, live forecasts and honest cost estimates.',
    path: '/',
  });
  const { hash } = useRouter();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);
  return (
    <main id="main">
      <Hero />
      <DestinationIndex />
      <AgentIntro />
      <LiveConditions />
      <HowItWorks />
      <EnquiryCta />
      <Sources />
    </main>
  );
}
