import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

export function useHeroCapability(): 'full' | 'static' {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [capability, setCapability] = useState<'full' | 'static'>('static');

  useEffect(() => {
    const lowConcurrency = (navigator.hardwareConcurrency ?? 8) <= 4;
    const narrowViewport = window.innerWidth < 768;
    setCapability(prefersReducedMotion || lowConcurrency || narrowViewport ? 'static' : 'full');
  }, [prefersReducedMotion]);

  return capability;
}
