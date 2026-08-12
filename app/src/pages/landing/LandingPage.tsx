import { Navbar } from './Navbar';
import { Hero } from './Hero';
import { CTCComparison } from './CTCComparison';
import { BentoGrid } from './BentoGrid';
import { PresenceSandbox } from './PresenceSandbox';
import { Footer } from './Footer';
import { useSmoothScroll } from './useSmoothScroll';

export function LandingPage() {
  useSmoothScroll();

  return (
    <div className="min-h-screen bg-court text-cream">
      <Navbar />
      <main>
        <Hero />
        <CTCComparison />
        <BentoGrid />
        <PresenceSandbox />
      </main>
      <Footer />
    </div>
  );
}
