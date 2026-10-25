import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { AccountContext } from './auth/useAccount';
import App from './App';

/**
 * Build-time render of one public route, run by `scripts/prerender.mjs`. The
 * account is `isLoading: true`, the exact state the browser's first render
 * has before the session restore answers, so hydration matches.
 */
export function render(url: string): string {
  return renderToString(
    <AccountContext.Provider
      value={{ user: null, isLoading: true, isError: false, retry: () => undefined }}
    >
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </AccountContext.Provider>,
  );
}
