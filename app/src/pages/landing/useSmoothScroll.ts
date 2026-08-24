import { useEffect, useState } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function useSmoothScroll() {
  const [lenis, setLenis] = useState<Lenis | null>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    const lenisInstance = new Lenis();

    function onTick(time: number) {
      lenisInstance.raf(time * 1000);
    }

    lenisInstance.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(onTick);
    gsap.ticker.lagSmoothing(0);

    setLenis(lenisInstance);

    return () => {
      gsap.ticker.remove(onTick);
      lenisInstance.destroy();
      setLenis(null);
    };
  }, []);

  return lenis;
}
