import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SITE_URL, resolveRouteSeo } from './routeSeo';

function upsertHead(selector: string, create: () => HTMLElement): HTMLElement {
  const existing = document.head.querySelector<HTMLElement>(selector);
  if (existing) return existing;
  const el = create();
  document.head.appendChild(el);
  return el;
}

/** Keeps `<title>`, the canonical link and the robots meta in step with the route. */
export function RouteSeo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const { title, index } = resolveRouteSeo(pathname);
    document.title = title;

    const robots = upsertHead('meta[name="robots"]', () => {
      const el = document.createElement('meta');
      el.setAttribute('name', 'robots');
      return el;
    });
    robots.setAttribute('content', index ? 'index, follow' : 'noindex, nofollow');

    const canonical = upsertHead('link[rel="canonical"]', () => {
      const el = document.createElement('link');
      el.setAttribute('rel', 'canonical');
      return el;
    });
    if (index) {
      const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : '';
      canonical.setAttribute('href', `${SITE_URL}${path || '/'}`);
    } else {
      canonical.removeAttribute('href');
    }
  }, [pathname]);

  return null;
}
