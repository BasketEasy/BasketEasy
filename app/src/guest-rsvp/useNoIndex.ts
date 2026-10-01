import { useEffect } from 'react';

/**
 * Keeps this page out of search indexes and out of the Referer sent to
 * anything it links to: the token is in the URL. The API already sends the
 * matching headers; these cover the SPA shell, which nginx serves.
 */
export function useNoIndex() {
  useEffect(() => {
    const tags = [
      ['robots', 'noindex, nofollow'],
      ['referrer', 'no-referrer'],
    ].map(([name, content]) => {
      const meta = document.createElement('meta');
      meta.name = name;
      meta.content = content;
      document.head.appendChild(meta);
      return meta;
    });
    return () => tags.forEach((meta) => meta.remove());
  }, []);
}
