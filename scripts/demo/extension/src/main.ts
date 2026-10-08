// Runs in the page before Kluvo's own code: every call to the Kluvo API is
// answered from the demo world, and nothing reaches the real server. Three
// ways in, same file: the Chrome extension (MAIN world, document_start),
// pasted at the top of kluvo.net's main bundle through a DevTools override,
// or run as a DevTools snippet on the login page.
// Persona: `?demo=coach` / `?demo=joueuse`, or Alt+Shift+K to switch;
// `?demo=reset` or Alt+Shift+R restores the demo's starting state.

import { handle } from './api';
import { loadState, resetState, saveState, type DemoState } from './state';
import { buildWorld, type DemoConfig, type PersonaKey, type World } from './world';

declare global {
  interface Window {
    __KLUVO_DEMO_CONFIG__?: Partial<DemoConfig> & { persona?: PersonaKey };
    __KLUVO_DEMO__?: boolean;
    __KLUVO_REAL_FETCH__?: typeof fetch;
  }
}

const config: DemoConfig = { played: 8, ...window.__KLUVO_DEMO_CONFIG__ };
const defaultPersona: PersonaKey = window.__KLUVO_DEMO_CONFIG__?.persona ?? 'coach';

let state: DemoState = loadState(defaultPersona);

const url = new URL(location.href);
const demoParam = url.searchParams.get('demo');
if (demoParam) {
  if (demoParam === 'reset') state = resetState(state.persona);
  if (demoParam === 'coach' || demoParam === 'joueuse') {
    state.persona = demoParam;
    state.loggedOut = false;
    saveState(state);
  }
  url.searchParams.delete('demo');
  history.replaceState(history.state, '', url.toString());
}

// The world only depends on the day and the config; rebuilt hourly so a
// demo left open overnight rolls over like the real app would.
let world: World = buildWorld(Date.now(), config);
let builtAt = Date.now();
function currentWorld(): World {
  if (Date.now() - builtAt > 60 * 60 * 1000) {
    world = buildWorld(Date.now(), config);
    builtAt = Date.now();
  }
  return world;
}

const nativeFetch: typeof fetch = window.__KLUVO_REAL_FETCH__ ?? window.fetch.bind(window);
window.__KLUVO_REAL_FETCH__ = nativeFetch;
// What non-API requests go through. A script that replaces window.fetch after
// this one (Cloudflare's bot detection on kluvo.net does) lands here instead
// of in front of the demo, so the app's API calls never leave the page.
let downstream: typeof fetch = nativeFetch;
let callingDownstream = false;

function isApiUrl(u: URL): boolean {
  return (
    u.pathname.startsWith('/api/') &&
    (u.hostname === location.hostname ||
      /(^|\.)kluvo\.(net|app|fr)$/.test(u.hostname) ||
      u.hostname === 'localhost')
  );
}

const latency = () => new Promise((r) => setTimeout(r, 90 + Math.random() * 160));

async function readBody(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : null);
  if (typeof raw !== 'string' || raw === '') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const target = new URL(href, location.href);
  if (target.hostname === 'kluvo-demo.invalid' || isApiUrl(target)) {
    return answer(target, input, init);
  }
  // A wrapper installed after us calls back into us: break the loop there.
  if (callingDownstream) return nativeFetch(input, init);
  callingDownstream = true;
  try {
    return downstream(input, init);
  } finally {
    callingDownstream = false;
  }
}

async function answer(
  target: URL,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (target.hostname === 'kluvo-demo.invalid') {
    await latency();
    return new Response(null, { status: 200 });
  }
  const path = target.pathname.replace(/^\/api/, '');
  const body = await readBody(input, init);
  await latency();
  const result = handle(
    {
      world: currentWorld(),
      state,
      persona: state.persona,
      now: Date.now(),
      save: () => saveState(state),
    },
    method,
    path,
    target.searchParams,
    body,
  );
  if (!result) {
    console.warn(`[Kluvo démo] route non simulée : ${method} ${path}`);
    if (method === 'GET') {
      return new Response(
        JSON.stringify({ statusCode: 404, message: 'Non disponible dans la démo' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    return new Response(null, { status: 204 });
  }
  if (result.status === 204) return new Response(null, { status: 204 });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

if (!window.__KLUVO_DEMO__) {
  try {
    Object.defineProperty(window, 'fetch', {
      configurable: false,
      enumerable: true,
      get: () => demoFetch,
      set: (value: unknown) => {
        if (typeof value === 'function' && value !== demoFetch) downstream = value as typeof fetch;
      },
    });
  } catch {
    window.fetch = demoFetch;
  }
}

window.__KLUVO_DEMO__ = true;

// Both shortcuts land on the dashboard rather than reloading the current
// URL: a DevTools override only covers the document it was made on.
window.addEventListener('keydown', (event) => {
  if (!event.altKey || !event.shiftKey) return;
  if (event.code === 'KeyK') {
    state.persona = state.persona === 'coach' ? 'joueuse' : 'coach';
    state.loggedOut = false;
    saveState(state);
    location.assign('/dashboard');
  } else if (event.code === 'KeyR') {
    state = resetState(state.persona);
    location.assign('/dashboard');
  }
});

console.info(
  `[Kluvo démo] actif : ${state.persona === 'coach' ? 'Hélène Cadiou (coach)' : 'Léa Moreau (joueuse)'}. Alt+Maj+K change de personne, Alt+Maj+R repart de zéro.`,
);
