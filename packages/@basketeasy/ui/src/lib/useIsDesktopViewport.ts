import { useEffect, useState } from 'react';

export const DESKTOP_BREAKPOINT_PX = 768;

// A burger menu, or a table dense enough to need horizontal scroll, is a
// desktop-first pattern — on a narrow screen it either hides navigation the
// user expects to see at a glance, or forces sideways scrolling to read a
// row. Below the breakpoint, callers swap in the mobile-friendly layout
// (inline nav links, a stacked card list) instead.
export function useIsDesktopViewport(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT_PX,
  );

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT_PX);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isDesktop;
}
