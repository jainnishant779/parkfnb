import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import HowItWorks from './pages/HowItWorks';
import Features from './pages/Features';
import SmartGates from './pages/SmartGates';
import Owners from './pages/Owners';
import Pricing from './pages/Pricing';
import About from './pages/About';
import Contact from './pages/Contact';
import Faq from './pages/Faq';
import Download from './pages/Download';
import { Privacy, Terms } from './pages/Legal';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="how-it-works" element={<HowItWorks />} />
        <Route path="features" element={<Features />} />
        <Route path="smart-gates" element={<SmartGates />} />
        <Route path="owners" element={<Owners />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="about" element={<About />} />
        <Route path="contact" element={<Contact />} />
        <Route path="faq" element={<Faq />} />
        <Route path="download" element={<Download />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="terms" element={<Terms />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
