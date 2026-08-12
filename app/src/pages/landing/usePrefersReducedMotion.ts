import { useEffect, useState } from 'react';

// Defaults to true (assume reduced motion) rather than false: jsdom has no
// matchMedia, so without this default every test that renders Hero or
// CTCComparison would need to stub matchMedia just to avoid mounting a real
// WebGL canvas or GSAP ScrollTrigger pin. Real browsers correct this to the
// user's actual preference on mount.
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(true);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    setPrefersReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  return prefersReducedMotion;
}
