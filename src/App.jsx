import { AppProvider } from './context/AppContext.jsx';
import Navbar from './components/Navbar.jsx';
import Hero from './components/hero/Hero.jsx';
import Destinations from './components/destinations/Destinations.jsx';
import DestinationDialog from './components/destinations/DestinationDialog.jsx';
import TripPlanner from './components/planner/TripPlanner.jsx';
import Experiences from './components/sections/Experiences.jsx';
import FeatureStrip from './components/sections/FeatureStrip.jsx';
import WhyRaahi from './components/sections/WhyRaahi.jsx';
import Seasons from './components/sections/Seasons.jsx';
import Safety from './components/sections/Safety.jsx';
import FinalCTA from './components/sections/FinalCTA.jsx';
import Footer from './components/sections/Footer.jsx';
import AssistantSheet from './components/assistant/AssistantSheet.jsx';

export default function App() {
  return (
    <AppProvider>
      <Navbar />
      <main id="main">
        <Hero />
        <FeatureStrip />
        <Destinations />
        <WhyRaahi />
        <TripPlanner />
        <Experiences />
        <Seasons />
        <Safety />
        <FinalCTA />
      </main>
      <Footer />
      <DestinationDialog />
      <AssistantSheet />
    </AppProvider>
  );
}
