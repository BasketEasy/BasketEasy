# BasketEasy Landing Page V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static `app/src/pages/LandingPage.tsx` with an animation-driven marketing page (WebGL hero, scroll-driven CTC comparison, bento feature grid, interactive presence sandbox) per `docs/superpowers/specs/2026-08-12-basketeasy-landing-v2-design.md`.

**Architecture:** New `app/src/pages/landing/` directory, one component per section, composed by a slim `LandingPage.tsx`. Heavy/animated pieces (`HeroCanvas`, GSAP ScrollTrigger, Lenis) are isolated behind small hooks/components so the rest of the tree can be tested normally in jsdom without mocking WebGL.

**Tech Stack:** React 18 + Vite (existing), adding `three`, `@react-three/fiber`, `@react-three/drei`, `gsap`, `lenis`, `framer-motion` — first use of all five in this project.

## Global Constraints

- All product copy is French (existing project convention — no i18n library).
- Every feature not yet built keeps the `<Badge variant="secondary">Bientôt</Badge>` convention already used on the current landing page (see `app/src/pages/LandingPage.tsx`'s current `FEATURES`/`HIGHLIGHTS` arrays).
- The sandbox/comparison sections are pure client-side state — no API calls.
- `@react-three/fiber@^8.18.0` and `@react-three/drei@9.121.4` (pinned exact — later 9.x releases require React 19/fiber 9, a peer-dependency break) are the versions confirmed compatible with this project's React `^18.3.1`. Do not bump `@react-three/drei` past `9.121.4` without re-checking its peer dependencies.
- Package name is `lenis` (not the deprecated `@studio-freight/lenis`, which the registry reports as renamed).
- Deviation from the source spec, decided during implementation: the navbar keeps the existing "Se connecter" / "Créer un compte" / "Mon espace" CTA labels and routing (not the spec's "Découvrir la plateforme", which has no defined destination) — this preserves the already-tested auth-aware navigation behavior from the current landing page.
- `usePrefersReducedMotion` (Task 3) defaults to `true` (assume reduced motion) until `matchMedia` proves otherwise. This is both a reasonable accessibility default and what keeps GSAP/ScrollTrigger and the WebGL canvas from ever mounting under jsdom (which has no `matchMedia`) without needing per-test mocking.

---

## Task 1: Dependencies, Tailwind tokens, stack doc

**Files:**
- Modify: `app/package.json`
- Modify: `packages/@basketeasy/ui/tailwind-preset.cjs`
- Modify: `docs/frontend-stack.md`

**Interfaces:**
- Produces: Tailwind color tokens `court` (`#12100E`), `card` (`#1D1A17`), `orange-glow` (`#E8743B`) available as `bg-court`, `text-court`, `bg-card`, etc. in `app/`.

- [ ] **Step 1: Add the new dependencies to `app/package.json`**

In the `"dependencies"` object, add:

```json
    "@react-three/drei": "9.121.4",
    "@react-three/fiber": "^8.18.0",
    "framer-motion": "^13.1.0",
    "gsap": "^3.15.0",
    "lenis": "^1.3.26",
    "three": "^0.185.1",
```

In the `"devDependencies"` object, add:

```json
    "@types/three": "^0.185.4",
```

Keep both objects alphabetically sorted (matches the existing file's ordering).

- [ ] **Step 2: Install**

Run: `pnpm install` (from the repo root)
Expected: lockfile updates, no peer dependency warnings for `@react-three/fiber`, `@react-three/drei`, `three`, or `framer-motion`.

- [ ] **Step 3: Add the dark/court color tokens**

In `packages/@basketeasy/ui/tailwind-preset.cjs`, inside `theme.extend.colors`, add alongside the existing `orange`/`blue-green`/`cream`/`charcoal` entries:

```js
        court: '#12100E',
        card: '#1D1A17',
        'orange-glow': '#E8743B',
```

- [ ] **Step 4: Record the stack decision**

In `docs/frontend-stack.md`, under `## Open decisions`, add a new bullet:

```markdown
- The landing page (`app/src/pages/landing/`) is the first and only place using `three`/`@react-three/fiber`/`@react-three/drei`, `gsap`, `lenis`, and `framer-motion` — added for the V2 marketing page's WebGL hero and scroll animations. Not adopted app-wide; re-evaluate if a second page wants scroll/3D animation before assuming this is the project's animation stack.
```

- [ ] **Step 5: Commit**

```bash
git add app/package.json pnpm-lock.yaml packages/@basketeasy/ui/tailwind-preset.cjs docs/frontend-stack.md
git commit -m "chore(app): add landing page V2 dependencies and design tokens"
```

---

## Task 2: Landing page copy & sample data

**Files:**
- Create: `app/src/pages/landing/data.ts`
- Test: `app/src/pages/landing/data.test.ts`

**Interfaces:**
- Produces:
  - `interface FeatureCopy { title: string; description: string; badge?: string }`
  - `const BENTO_FEATURES: FeatureCopy[]` (length 4)
  - `interface RosterPlayer { id: number; name: string; club: string; status: 'present' | 'absent' }`
  - `const SANDBOX_ROSTER: RosterPlayer[]` (length 3)

- [ ] **Step 1: Write the failing test**

```typescript
// app/src/pages/landing/data.test.ts
import { describe, expect, it } from 'vitest';
import { BENTO_FEATURES, SANDBOX_ROSTER } from './data';

describe('landing data', () => {
  it('has exactly 4 bento features, matching the bento grid layout', () => {
    expect(BENTO_FEATURES).toHaveLength(4);
  });

  it('badges only the two not-yet-built bento features', () => {
    const badged = BENTO_FEATURES.filter((feature) => feature.badge);
    expect(badged).toHaveLength(2);
    expect(badged.every((feature) => feature.badge === 'Bientôt')).toBe(true);
  });

  it('has a 3-player sample roster with at least one present and one absent', () => {
    expect(SANDBOX_ROSTER).toHaveLength(3);
    expect(SANDBOX_ROSTER.some((player) => player.status === 'present')).toBe(true);
    expect(SANDBOX_ROSTER.some((player) => player.status === 'absent')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/app test -- data.test.ts`
Expected: FAIL with "Cannot find module './data'"

- [ ] **Step 3: Write the implementation**

```typescript
// app/src/pages/landing/data.ts
export interface FeatureCopy {
  title: string;
  description: string;
  badge?: string;
}

// Card 1 (présences) and Card 2 (calendriers/résultats) describe features
// that aren't built yet, so they keep the same "Bientôt" convention as the
// old LandingPage's FEATURES/HIGHLIGHTS. Card 3 (RGPD/hosting) and Card 4
// (built-for-volunteers positioning) are statements of current fact, not
// future features, so they aren't badged.
export const BENTO_FEATURES: FeatureCopy[] = [
  {
    title: 'Présences suivies',
    description:
      "Confirmations de présence en un clin d'œil, sans relance manuelle par SMS ou tableur — testez-le ci-dessous.",
    badge: 'Bientôt',
  },
  {
    title: 'Calendriers & résultats synchronisés',
    description:
      "Prochains entraînements, matchs et résultats au même endroit, à jour en permanence pour toute l'équipe.",
    badge: 'Bientôt',
  },
  {
    title: 'Conforme RGPD · Hébergement France',
    description:
      'Données hébergées en France · RGPD par défaut pour la protection des données des mineurs.',
  },
  {
    title: 'Pensé pour les bénévoles',
    description:
      "Zéro surcharge : un manager d'équipe met en place un jour de match en moins de 60 secondes.",
  },
];

export interface RosterPlayer {
  id: number;
  name: string;
  club: string;
  status: 'present' | 'absent';
}

export const SANDBOX_ROSTER: RosterPlayer[] = [
  { id: 1, name: 'Lucas M.', club: 'AIL de Goulaine', status: 'present' },
  { id: 2, name: 'Thomas B.', club: 'Entente Sud Basket', status: 'absent' },
  { id: 3, name: 'Antoine R.', club: 'CTC Basket 44', status: 'present' },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @basketeasy/app test -- data.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/pages/landing/data.ts app/src/pages/landing/data.test.ts
git commit -m "feat(app): add landing page V2 copy and sample sandbox data"
```

---

## Task 3: `usePrefersReducedMotion` hook

**Files:**
- Create: `app/src/pages/landing/usePrefersReducedMotion.ts`
- Test: `app/src/pages/landing/usePrefersReducedMotion.test.ts`

**Interfaces:**
- Produces: `usePrefersReducedMotion(): boolean` — `true` by default and whenever `window.matchMedia` is unavailable (jsdom) or reports `(prefers-reduced-motion: reduce)` matches; `false` only once `matchMedia` confirms it doesn't match.
- Consumed by: Task 4 (`useHeroCapability`), Task 11 (`CTCComparison`).

- [ ] **Step 1: Write the failing test**

```typescript
// app/src/pages/landing/usePrefersReducedMotion.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePrefersReducedMotion', () => {
  it('defaults to true when matchMedia is unavailable (jsdom default)', () => {
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it('returns false once matchMedia reports no reduced-motion preference', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it('returns true when matchMedia reports a reduced-motion preference', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/app test -- usePrefersReducedMotion.test.ts`
Expected: FAIL with "Cannot find module './usePrefersReducedMotion'"

- [ ] **Step 3: Write the implementation**

```typescript
// app/src/pages/landing/usePrefersReducedMotion.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @basketeasy/app test -- usePrefersReducedMotion.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/pages/landing/usePrefersReducedMotion.ts app/src/pages/landing/usePrefersReducedMotion.test.ts
git commit -m "feat(app): add usePrefersReducedMotion hook for landing page animations"
```

---

## Task 4: `useHeroCapability` hook

**Files:**
- Create: `app/src/pages/landing/useHeroCapability.ts`
- Test: `app/src/pages/landing/useHeroCapability.test.ts`

**Interfaces:**
- Consumes: `usePrefersReducedMotion()` from Task 3.
- Produces: `useHeroCapability(): 'full' | 'static'` — `'static'` until an effect confirms the browser can handle the WebGL hero (not reduced-motion, `navigator.hardwareConcurrency > 4`, viewport `>= 768px`).
- Consumed by: Task 10 (`Hero`).

- [ ] **Step 1: Write the failing test**

```typescript
// app/src/pages/landing/useHeroCapability.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHeroCapability } from './useHeroCapability';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('useHeroCapability', () => {
  it('is static by default (jsdom has no matchMedia)', () => {
    const { result } = renderHook(() => useHeroCapability());
    expect(result.current).toBe('static');
  });

  it('is static when the viewport is narrow, even on a capable device', () => {
    stubMatchMedia(false);
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 });
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(500);

    const { result } = renderHook(() => useHeroCapability());
    expect(result.current).toBe('static');
  });

  it('is full on a wide, high-concurrency device with no reduced-motion preference', () => {
    stubMatchMedia(false);
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 });
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);

    const { result } = renderHook(() => useHeroCapability());
    expect(result.current).toBe('full');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/app test -- useHeroCapability.test.ts`
Expected: FAIL with "Cannot find module './useHeroCapability'"

- [ ] **Step 3: Write the implementation**

```typescript
// app/src/pages/landing/useHeroCapability.ts
import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

export function useHeroCapability(): 'full' | 'static' {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [capability, setCapability] = useState<'full' | 'static'>('static');

  useEffect(() => {
    const lowConcurrency = (navigator.hardwareConcurrency ?? 8) <= 4;
    const narrowViewport = window.innerWidth < 768;
    setCapability(
      prefersReducedMotion || lowConcurrency || narrowViewport ? 'static' : 'full',
    );
  }, [prefersReducedMotion]);

  return capability;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @basketeasy/app test -- useHeroCapability.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/pages/landing/useHeroCapability.ts app/src/pages/landing/useHeroCapability.test.ts
git commit -m "feat(app): add useHeroCapability hook for WebGL hero mobile fallback"
```

---

## Task 5: `Navbar` component

**Files:**
- Create: `app/src/pages/landing/Navbar.tsx`
- Test: `app/src/pages/landing/Navbar.test.tsx`

**Interfaces:**
- Consumes: `useAccount()` from `app/src/auth/useAccount.ts` (existing).
- Produces: `export function Navbar(): JSX.Element` — fixed dark glassmorphic bar, no props.

- [ ] **Step 1: Write the failing test**

```typescript
// app/src/pages/landing/Navbar.test.tsx
import { describe, expect, it } from 'vitest';
import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../mocks/server';
import { AccountProvider } from '../../auth/AccountContext';
import { Navbar } from './Navbar';

function renderNavbar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<Navbar />} />
            <Route path="/login" element={<div>Page de connexion</div>} />
            <Route path="/register" element={<div>Page de création de compte</div>} />
            <Route path="/dashboard" element={<div>Tableau de bord</div>} />
          </Routes>
        </MemoryRouter>
      </AccountProvider>
    </QueryClientProvider>,
  );
}

describe('Navbar', () => {
  it('shows the BasketEasy wordmark and CTC badge', () => {
    renderNavbar();
    expect(screen.getByText('BasketEasy')).toBeInTheDocument();
    expect(screen.getByText('Pensé pour les CTC & Ententes')).toBeInTheDocument();
  });

  it('shows login/register CTAs when logged out, and navigates to /register on click', async () => {
    const user = userEvent.setup();
    renderNavbar();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /créer un compte/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /créer un compte/i }));
    expect(screen.getByText('Page de création de compte')).toBeInTheDocument();
  });

  it('shows "Mon espace" when logged in', async () => {
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
      http.get('/api/auth/me', () =>
        HttpResponse.json({ id: 'user-1', email: 'a@b.com', memberships: [] }),
      ),
    );

    renderNavbar();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mon espace/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /se connecter/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/app test -- Navbar.test.tsx`
Expected: FAIL with "Cannot find module './Navbar'"

- [ ] **Step 3: Write the implementation**

```typescript
// app/src/pages/landing/Navbar.tsx
import { useNavigate } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Badge } from '@basketeasy/ui/badge';
import { useAccount } from '../../auth/useAccount';

export function Navbar() {
  const navigate = useNavigate();
  const { user, isLoading } = useAccount();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-court/70 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
        <span className="font-heading text-2xl font-extrabold text-orange">BasketEasy</span>
        <Badge variant="secondary" className="hidden sm:inline-flex">
          Pensé pour les CTC & Ententes
        </Badge>
        <div className="flex flex-wrap items-center gap-3">
          {!isLoading &&
            (user ? (
              <Button
                className="shrink-0 whitespace-nowrap"
                onClick={() => navigate('/dashboard')}
              >
                Mon espace
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  className="shrink-0 whitespace-nowrap text-cream hover:bg-white/10"
                  onClick={() => navigate('/login')}
                >
                  Se connecter
                </Button>
                <Button
                  className="shrink-0 whitespace-nowrap"
                  onClick={() => navigate('/register')}
                >
                  Créer un compte
                </Button>
              </>
            ))}
        </div>
      </nav>
    </header>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @basketeasy/app test -- Navbar.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/pages/landing/Navbar.tsx app/src/pages/landing/Navbar.test.tsx
git commit -m "feat(app): add landing page V2 Navbar"
```

---

## Task 6: `Footer` component

**Files:**
- Create: `app/src/pages/landing/Footer.tsx`
- Test: `app/src/pages/landing/Footer.test.tsx`

**Interfaces:**
- Produces: `export function Footer(): JSX.Element`, no props.

- [ ] **Step 1: Write the failing test**

```typescript
// app/src/pages/landing/Footer.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Footer } from './Footer';

function renderFooter() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Footer />} />
        <Route path="/login" element={<div>Page de connexion</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Footer', () => {
  it('renders the BasketEasy wordmark and the required RGPD line', () => {
    renderFooter();
    expect(screen.getByText('BasketEasy')).toBeInTheDocument();
    expect(screen.getByText('Données hébergées en France · RGPD')).toBeInTheDocument();
  });

  it('renders Contact/Mentions légales/Politique de confidentialité as plain text, not links', () => {
    renderFooter();
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Contact' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Contact' })).not.toBeInTheDocument();
  });

  it('navigates to /login when "Connexion club" is clicked', async () => {
    const user = userEvent.setup();
    renderFooter();

    await user.click(screen.getByRole('button', { name: 'Connexion club' }));
    expect(screen.getByText('Page de connexion')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/app test -- Footer.test.tsx`
Expected: FAIL with "Cannot find module './Footer'"

- [ ] **Step 3: Write the implementation**

```typescript
// app/src/pages/landing/Footer.tsx
import { useNavigate } from 'react-router-dom';

// Only "Connexion club" points somewhere real (/login). The other three
// have no pages yet, so they render as plain text rather than dead
// href="#" links — same "don't imply functionality that isn't there"
// principle as the Bientôt badges elsewhere on this page.
const PLACEHOLDER_LINKS = ['Contact', 'Mentions légales', 'Politique de confidentialité'];

export function Footer() {
  const navigate = useNavigate();

  return (
    <footer className="bg-charcoal px-6 py-16 text-center text-cream">
      <div className="mx-auto max-w-5xl">
        <p className="font-heading text-5xl font-extrabold uppercase tracking-tight">
          BasketEasy
        </p>
        <p className="mt-4 text-sm text-stone-400">Données hébergées en France · RGPD</p>
        <nav className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          {PLACEHOLDER_LINKS.map((label) => (
            <span key={label} className="text-stone-500">
              {label}
            </span>
          ))}
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-cream underline-offset-4 hover:underline"
          >
            Connexion club
          </button>
        </nav>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @basketeasy/app test -- Footer.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/pages/landing/Footer.tsx app/src/pages/landing/Footer.test.tsx
git commit -m "feat(app): add landing page V2 Footer"
```

---

## Task 7: `PresenceSandbox` component

**Files:**
- Create: `app/src/pages/landing/PresenceSandbox.tsx`
- Test: `app/src/pages/landing/PresenceSandbox.test.tsx`

**Interfaces:**
- Consumes: `SANDBOX_ROSTER`, `RosterPlayer` from Task 2's `./data`.
- Produces: `export function PresenceSandbox(): JSX.Element`, section `id="demo"` (scroll target for Hero's "Tester la démo live" button, Task 10).

- [ ] **Step 1: Write the failing test**

```typescript
// app/src/pages/landing/PresenceSandbox.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PresenceSandbox } from './PresenceSandbox';
import { SANDBOX_ROSTER } from './data';

describe('PresenceSandbox', () => {
  it('renders the initial present count from the sample roster', () => {
    render(<PresenceSandbox />);
    const initialPresent = SANDBOX_ROSTER.filter((p) => p.status === 'present').length;
    expect(
      screen.getByText(`${initialPresent} / ${SANDBOX_ROSTER.length} PRÉSENTS`),
    ).toBeInTheDocument();
  });

  it('toggles a player between present and absent, updating the count', async () => {
    const user = userEvent.setup();
    render(<PresenceSandbox />);

    const absentPlayer = SANDBOX_ROSTER.find((p) => p.status === 'absent');
    if (!absentPlayer) {
      throw new Error('fixture must include at least one absent player');
    }

    const initialPresent = SANDBOX_ROSTER.filter((p) => p.status === 'present').length;
    const row = screen.getByText(absentPlayer.name).closest('div')!.parentElement!;
    const toggleButton = row.querySelector('button')!;

    expect(toggleButton).toHaveTextContent('✕ ABSENT');
    await user.click(toggleButton);

    expect(toggleButton).toHaveTextContent('✓ PRÉSENT');
    expect(
      screen.getByText(`${initialPresent + 1} / ${SANDBOX_ROSTER.length} PRÉSENTS`),
    ).toBeInTheDocument();
  });

  it('has a #demo anchor for the hero CTA to scroll to', () => {
    const { container } = render(<PresenceSandbox />);
    expect(container.querySelector('#demo')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/app test -- PresenceSandbox.test.tsx`
Expected: FAIL with "Cannot find module './PresenceSandbox'"

- [ ] **Step 3: Write the implementation**

```typescript
// app/src/pages/landing/PresenceSandbox.tsx
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Heading } from '@basketeasy/ui/heading';
import { SANDBOX_ROSTER, type RosterPlayer } from './data';

export function PresenceSandbox() {
  const [roster, setRoster] = useState<RosterPlayer[]>(SANDBOX_ROSTER);

  function toggleStatus(id: number) {
    setRoster((current) =>
      current.map((player) =>
        player.id === id
          ? { ...player, status: player.status === 'present' ? 'absent' : 'present' }
          : player,
      ),
    );
  }

  const presentCount = roster.filter((player) => player.status === 'present').length;

  return (
    <section id="demo" className="bg-cream py-24 text-charcoal">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-12 text-center">
          <Heading as="h2" size="5xl" className="font-heading uppercase text-orange-text">
            Gérez les présences en 1 clic
          </Heading>
          <p className="mt-2 font-medium text-blue-green">
            Simulez la convocation d&apos;une équipe CTC réagissant en temps réel.
          </p>
        </div>

        <div className="rounded-3xl border border-orange/30 bg-card p-8 text-cream shadow-2xl">
          <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <span className="font-mono text-xs uppercase tracking-widest text-blue-green">
                Match du samedi · U17-1 CTC
              </span>
              <h3 className="font-heading text-2xl font-bold">Feuille de match</h3>
            </div>
            <div className="rounded-xl bg-orange px-4 py-2 font-mono text-sm font-bold">
              {presentCount} / {roster.length} PRÉSENTS
            </div>
          </div>

          <div className="space-y-4">
            {roster.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-black/40 p-4"
              >
                <div>
                  <p className="text-base font-bold">{player.name}</p>
                  <p className="text-xs text-stone-400">{player.club}</p>
                </div>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => toggleStatus(player.id)}
                  className={
                    player.status === 'present'
                      ? 'rounded-lg bg-orange px-5 py-2 text-xs font-bold text-cream shadow-lg shadow-orange/30 transition-colors'
                      : 'rounded-lg bg-stone-800 px-5 py-2 text-xs font-bold text-stone-400 transition-colors'
                  }
                >
                  {player.status === 'present' ? '✓ PRÉSENT' : '✕ ABSENT'}
                </motion.button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @basketeasy/app test -- PresenceSandbox.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/pages/landing/PresenceSandbox.tsx app/src/pages/landing/PresenceSandbox.test.tsx
git commit -m "feat(app): add landing page V2 presence sandbox demo"
```

---

## Task 8: `BentoGrid` component

**Files:**
- Create: `app/src/pages/landing/BentoGrid.tsx`
- Test: `app/src/pages/landing/BentoGrid.test.tsx`

**Interfaces:**
- Consumes: `BENTO_FEATURES` from Task 2's `./data`.
- Produces: `export function BentoGrid(): JSX.Element`, no props.

- [ ] **Step 1: Write the failing test**

```typescript
// app/src/pages/landing/BentoGrid.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BentoGrid } from './BentoGrid';
import { BENTO_FEATURES } from './data';

describe('BentoGrid', () => {
  it('renders all 4 feature tiles', () => {
    render(<BentoGrid />);
    for (const feature of BENTO_FEATURES) {
      expect(screen.getByText(feature.title)).toBeInTheDocument();
    }
  });

  it('badges only the not-yet-built features', () => {
    render(<BentoGrid />);
    const badgedTitles = BENTO_FEATURES.filter((f) => f.badge).map((f) => f.title);
    const unbadgedTitles = BENTO_FEATURES.filter((f) => !f.badge).map((f) => f.title);

    expect(screen.getAllByText('Bientôt')).toHaveLength(badgedTitles.length);
    for (const title of unbadgedTitles) {
      const card = screen.getByText(title).closest('[class*="rounded"]');
      expect(card?.textContent).not.toContain('Bientôt');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/app test -- BentoGrid.test.tsx`
Expected: FAIL with "Cannot find module './BentoGrid'"

- [ ] **Step 3: Write the implementation**

```typescript
// app/src/pages/landing/BentoGrid.tsx
import { Badge } from '@basketeasy/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription } from '@basketeasy/ui/card';
import { BENTO_FEATURES } from './data';

// Spans per the spec's bento layout: card 1 and card 4 are wide (2 cols),
// cards 2 and 3 are narrow (1 col).
const SPAN_BY_INDEX = ['md:col-span-2', 'md:col-span-1', 'md:col-span-1', 'md:col-span-2'];

export function BentoGrid() {
  return (
    <section className="bg-court py-24 text-cream">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-6 md:grid-cols-2">
          {BENTO_FEATURES.map((feature, index) => (
            <Card
              key={feature.title}
              className={`border-white/10 bg-card ${SPAN_BY_INDEX[index]}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-cream">{feature.title}</CardTitle>
                  {feature.badge && <Badge variant="secondary">{feature.badge}</Badge>}
                </div>
                <CardDescription className="text-stone-400">
                  {feature.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @basketeasy/app test -- BentoGrid.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/pages/landing/BentoGrid.tsx app/src/pages/landing/BentoGrid.test.tsx
git commit -m "feat(app): add landing page V2 bento feature grid"
```

---

## Task 9: `HeroCanvas` component (WebGL, untested)

**Files:**
- Create: `app/src/pages/landing/HeroCanvas.tsx`

**Interfaces:**
- Produces: `export function HeroCanvas(): JSX.Element` — an R3F `<Canvas>` with a basketball mesh reacting to pointer position.
- Consumed by: Task 10 (`Hero`), which mocks this module in its own tests.

No test file for this task: jsdom has no WebGL context, so `@react-three/fiber`'s `Canvas` cannot mount in Vitest. This is a deliberate, documented gap (see the design doc's Testing section and Task 10/13, which mock this module) — visual correctness (basketball rendering, pointer reactivity, 60fps) is verified manually in the browser per Task 14.

- [ ] **Step 1: Write the implementation**

```typescript
// app/src/pages/landing/HeroCanvas.tsx
import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial } from '@react-three/drei';
import type { Mesh } from 'three';

function Basketball() {
  const meshRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) {
      return;
    }
    meshRef.current.rotation.y += 0.002 + Math.abs(state.pointer.x) * 0.01;
    meshRef.current.rotation.x += 0.001 + Math.abs(state.pointer.y) * 0.01;
  });

  return (
    <Sphere ref={meshRef} args={[1.4, 64, 64]}>
      <MeshDistortMaterial color="#D4622A" distort={0.15} speed={1.5} roughness={0.4} />
    </Sphere>
  );
}

export function HeroCanvas() {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 45 }} dpr={[1, 1.5]}>
      <ambientLight intensity={0.6} />
      <pointLight position={[5, 5, 5]} intensity={1.2} color="#E8743B" />
      <Basketball />
    </Canvas>
  );
}
```

- [ ] **Step 2: Manually verify it renders**

This is checked visually in Task 14's browser pass, not here — there's no automated step for this task beyond a TypeScript compile check.

Run: `pnpm --filter @basketeasy/app exec tsc --noEmit`
Expected: no type errors in `HeroCanvas.tsx`

- [ ] **Step 3: Commit**

```bash
git add app/src/pages/landing/HeroCanvas.tsx
git commit -m "feat(app): add WebGL basketball hero canvas"
```

---

## Task 10: `Hero` component

**Files:**
- Create: `app/src/pages/landing/Hero.tsx`
- Test: `app/src/pages/landing/Hero.test.tsx`

**Interfaces:**
- Consumes: `useHeroCapability()` from Task 4, `HeroCanvas` from Task 9 (mocked in tests).
- Produces: `export function Hero(): JSX.Element`, no props. Renders headline/subhead, a "Tester la démo live" button that scrolls to `#demo` (Task 7), and an "En savoir plus" button that scrolls to `#ctc-comparison` (Task 11).

- [ ] **Step 1: Write the failing test**

```typescript
// app/src/pages/landing/Hero.test.tsx
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Hero } from './Hero';

vi.mock('./HeroCanvas', () => ({
  HeroCanvas: () => <div data-testid="hero-canvas-stub" />,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Hero', () => {
  it('renders the brand headline and subhead', () => {
    render(<Hero />);
    expect(
      screen.getByRole('heading', { name: 'Moins de tableurs, plus de terrain.' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/BasketEasy centralise calendriers/)).toBeInTheDocument();
  });

  it('does not mount the WebGL canvas by default (jsdom has no matchMedia)', () => {
    render(<Hero />);
    expect(screen.queryByTestId('hero-canvas-stub')).not.toBeInTheDocument();
  });

  it('mounts the WebGL canvas when the device is reported as capable', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 });
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);

    render(<Hero />);
    expect(screen.getByTestId('hero-canvas-stub')).toBeInTheDocument();
  });

  it('scrolls to #demo when "Tester la démo live" is clicked', async () => {
    const user = userEvent.setup();
    document.body.innerHTML += '<div id="demo"></div>';
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(<Hero />);
    await user.click(screen.getByRole('button', { name: 'Tester la démo live' }));

    expect(scrollIntoView).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/app test -- Hero.test.tsx`
Expected: FAIL with "Cannot find module './Hero'"

- [ ] **Step 3: Write the implementation**

```typescript
// app/src/pages/landing/Hero.tsx
import { Button } from '@basketeasy/ui/button';
import { Heading } from '@basketeasy/ui/heading';
import { HeroCanvas } from './HeroCanvas';
import { useHeroCapability } from './useHeroCapability';

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

export function Hero() {
  const capability = useHeroCapability();

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-court text-cream">
      <div className="absolute inset-0">
        {capability === 'full' ? (
          <HeroCanvas />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background:
                'radial-gradient(circle at 70% 30%, rgba(232,116,59,0.35), transparent 55%), radial-gradient(circle at 20% 80%, rgba(212,98,42,0.25), transparent 50%)',
            }}
          />
        )}
      </div>

      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-32 text-center">
        <Heading as="h1" size="5xl" className="font-heading uppercase text-cream">
          Moins de tableurs, plus de terrain.
        </Heading>
        <p className="max-w-xl text-lg text-stone-300">
          BasketEasy centralise calendriers, résultats et présences pour les clubs de basket
          amateurs — y compris quand une équipe réunit plusieurs clubs. Pensé pour les bénévoles,
          pas pour les DSI.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={() => scrollToSection('demo')}>
            Tester la démo live
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-cream text-cream hover:bg-cream/10"
            onClick={() => scrollToSection('ctc-comparison')}
          >
            En savoir plus
          </Button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @basketeasy/app test -- Hero.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/pages/landing/Hero.tsx app/src/pages/landing/Hero.test.tsx
git commit -m "feat(app): add landing page V2 hero section"
```

---

## Task 11: `CTCComparison` component

**Files:**
- Create: `app/src/pages/landing/CTCComparison.tsx`
- Test: `app/src/pages/landing/CTCComparison.test.tsx`

**Interfaces:**
- Consumes: `usePrefersReducedMotion()` from Task 3.
- Produces: `export function CTCComparison(): JSX.Element`, section `id="ctc-comparison"` (Hero's "En savoir plus" scroll target).

- [ ] **Step 1: Write the failing test**

Tests force the reduced-motion (static) branch by relying on the hook's jsdom default (`true`) — this deliberately avoids exercising GSAP/ScrollTrigger in jsdom, per the design doc's testing notes. The animated wipe is verified manually in Task 14.

```typescript
// app/src/pages/landing/CTCComparison.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CTCComparison } from './CTCComparison';

describe('CTCComparison', () => {
  it('renders the section headline', () => {
    render(<CTCComparison />);
    expect(
      screen.getByRole('heading', { name: 'Une équipe, plusieurs clubs ? Enfin un seul outil.' }),
    ).toBeInTheDocument();
  });

  it('renders the static before/after copy (jsdom defaults to reduced motion)', () => {
    render(<CTCComparison />);
    expect(screen.getByText('AIL de Goulaine — effectif Excel')).toBeInTheDocument();
    expect(
      screen.getByText('Une seule liste, alimentée automatiquement par les trois clubs.'),
    ).toBeInTheDocument();
  });

  it('has a #ctc-comparison anchor for the hero CTA to scroll to', () => {
    const { container } = render(<CTCComparison />);
    expect(container.querySelector('#ctc-comparison')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/app test -- CTCComparison.test.tsx`
Expected: FAIL with "Cannot find module './CTCComparison'"

- [ ] **Step 3: Write the implementation**

```typescript
// app/src/pages/landing/CTCComparison.tsx
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Heading } from '@basketeasy/ui/heading';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

gsap.registerPlugin(ScrollTrigger);

const CHAOS_PANELS = [
  'AIL de Goulaine — effectif Excel',
  'Entente Sud Basket — fil WhatsApp',
  'CTC Basket 44 — portail séparé',
];

const RESOLUTION_COPY = 'Une seule liste, alimentée automatiquement par les trois clubs.';

export function CTCComparison() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    const section = sectionRef.current;
    const reveal = revealRef.current;
    if (!section || !reveal) {
      return;
    }

    const tween = gsap.fromTo(
      reveal,
      { clipPath: 'inset(0 100% 0 0)' },
      {
        clipPath: 'inset(0 0% 0 0)',
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=100%',
          scrub: true,
          pin: true,
        },
      },
    );

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [prefersReducedMotion]);

  return (
    <section
      id="ctc-comparison"
      ref={sectionRef}
      className="relative overflow-hidden bg-court py-24 text-cream"
    >
      <div className="mx-auto max-w-5xl px-6 text-center">
        <Heading as="h2" size="4xl" className="font-heading uppercase text-orange">
          Une équipe, plusieurs clubs ? Enfin un seul outil.
        </Heading>
      </div>

      <div className="relative mx-auto mt-12 max-w-5xl px-6">
        {prefersReducedMotion ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="grid gap-1 rounded-xl bg-stone-800 p-6 opacity-60">
              {CHAOS_PANELS.map((label) => (
                <p key={label} className="text-sm text-stone-400">
                  {label}
                </p>
              ))}
            </div>
            <div className="flex items-center justify-center rounded-xl bg-card p-6 text-center">
              <p className="text-lg font-semibold text-cream">{RESOLUTION_COPY}</p>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-2xl">
            <div className="grid grid-cols-1 gap-1 opacity-50 blur-sm md:grid-cols-3">
              {CHAOS_PANELS.map((label) => (
                <div key={label} className="rounded-xl bg-stone-800 p-6 text-sm text-stone-400">
                  {label}
                </div>
              ))}
            </div>
            <div
              ref={revealRef}
              className="absolute inset-0 flex items-center justify-center rounded-xl bg-card p-6 text-center"
              style={{ clipPath: 'inset(0 100% 0 0)' }}
            >
              <p className="text-lg font-semibold text-cream">{RESOLUTION_COPY}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @basketeasy/app test -- CTCComparison.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/pages/landing/CTCComparison.tsx app/src/pages/landing/CTCComparison.test.tsx
git commit -m "feat(app): add landing page V2 CTC comparison section"
```

---

## Task 12: `useSmoothScroll` hook

**Files:**
- Create: `app/src/pages/landing/useSmoothScroll.ts`

**Interfaces:**
- Produces: `useSmoothScroll(): void` — mounts a Lenis smooth-scroll instance for as long as the consuming component is mounted; no-ops under `prefers-reduced-motion` or when `matchMedia` is unavailable (jsdom).
- Consumed by: Task 13 (`LandingPage`).

No dedicated test file: the hook's entire body is gated behind `typeof window.matchMedia !== 'function'` (true in jsdom by default), so it already no-ops under every existing test that mounts `LandingPage` (Task 13's integration test covers that `LandingPage` renders without throwing, which is the only behavior worth asserting here).

- [ ] **Step 1: Write the implementation**

```typescript
// app/src/pages/landing/useSmoothScroll.ts
import { useEffect } from 'react';
import Lenis from 'lenis';

export function useSmoothScroll() {
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const lenis = new Lenis();
    let frameId: number;

    function raf(time: number) {
      lenis.raf(time);
      frameId = requestAnimationFrame(raf);
    }
    frameId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frameId);
      lenis.destroy();
    };
  }, []);
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @basketeasy/app exec tsc --noEmit`
Expected: no type errors in `useSmoothScroll.ts`

- [ ] **Step 3: Commit**

```bash
git add app/src/pages/landing/useSmoothScroll.ts
git commit -m "feat(app): add Lenis smooth-scroll hook for landing page"
```

---

## Task 13: Compose `LandingPage`, wire routing, remove the old page

**Files:**
- Create: `app/src/pages/landing/LandingPage.tsx`
- Create: `app/src/pages/landing/LandingPage.test.tsx`
- Modify: `app/src/App.tsx:5` (import path) and `App.tsx:20` (unchanged usage — `<LandingPage />` still renders at `/`)
- Delete: `app/src/pages/LandingPage.tsx`
- Delete: `app/src/pages/LandingPage.test.tsx`

**Interfaces:**
- Consumes: `Navbar` (Task 5), `Hero` (Task 10), `CTCComparison` (Task 11), `BentoGrid` (Task 8), `PresenceSandbox` (Task 7), `Footer` (Task 6), `useSmoothScroll` (Task 12).
- Produces: `export function LandingPage(): JSX.Element`, no props — same component name and route (`/`) as the file it replaces.

- [ ] **Step 1: Write the failing test**

This mirrors the assertions from the old `app/src/pages/LandingPage.test.tsx` (headline, RGPD line, auth-aware CTAs) plus a check that the new sections are present. `HeroCanvas` is mocked so mounting the full page never tries to create a real WebGL context.

```typescript
// app/src/pages/landing/LandingPage.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { server } from '../../mocks/server';
import { AccountProvider } from '../../auth/AccountContext';
import { LandingPage } from './LandingPage';

vi.mock('./HeroCanvas', () => ({
  HeroCanvas: () => <div data-testid="hero-canvas-stub" />,
}));

function renderLandingPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<div>Page de connexion</div>} />
            <Route path="/register" element={<div>Page de création de compte</div>} />
            <Route path="/dashboard" element={<div>Tableau de bord</div>} />
          </Routes>
        </MemoryRouter>
      </AccountProvider>
    </QueryClientProvider>,
  );
}

describe('LandingPage', () => {
  it('renders the brand headline and subhead', () => {
    renderLandingPage();
    expect(
      screen.getByRole('heading', { name: 'Moins de tableurs, plus de terrain.' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/BasketEasy centralise calendriers/)).toBeInTheDocument();
  });

  it('renders every section: comparison, bento grid, sandbox, footer', () => {
    renderLandingPage();
    expect(
      screen.getByRole('heading', { name: 'Une équipe, plusieurs clubs ? Enfin un seul outil.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Pensé pour les bénévoles')).toBeInTheDocument();
    expect(screen.getByText('Feuille de match')).toBeInTheDocument();
    expect(screen.getByText('Données hébergées en France · RGPD')).toBeInTheDocument();
  });

  it('shows login/register CTAs when logged out, and navigates to /register on click', async () => {
    const user = userEvent.setup();
    renderLandingPage();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /créer un compte/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /créer un compte/i }));
    expect(screen.getByText('Page de création de compte')).toBeInTheDocument();
  });

  it('shows "Mon espace" when logged in', async () => {
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
      http.get('/api/auth/me', () =>
        HttpResponse.json({ id: 'user-1', email: 'a@b.com', memberships: [] }),
      ),
    );

    renderLandingPage();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mon espace/i })).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/app test -- landing/LandingPage.test.tsx`
Expected: FAIL with "Cannot find module './LandingPage'"

- [ ] **Step 3: Write the implementation**

```typescript
// app/src/pages/landing/LandingPage.tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @basketeasy/app test -- landing/LandingPage.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire the route to the new page**

In `app/src/App.tsx`, change the import on line 5:

```typescript
import { LandingPage } from './pages/landing/LandingPage';
```

(This replaces `import { LandingPage } from './pages/LandingPage';` — no other line in `App.tsx` changes, since the component name and the route it's mounted on are unchanged.)

- [ ] **Step 6: Remove the old landing page files**

```bash
git rm app/src/pages/LandingPage.tsx app/src/pages/LandingPage.test.tsx
```

- [ ] **Step 7: Run the full app test suite to check for regressions**

Run: `pnpm --filter @basketeasy/app test`
Expected: PASS, no references to the deleted `app/src/pages/LandingPage.tsx` remain (check with `grep -rn "pages/LandingPage'" app/src` — should return nothing).

- [ ] **Step 8: Commit**

```bash
git add app/src/pages/landing/LandingPage.tsx app/src/pages/landing/LandingPage.test.tsx app/src/App.tsx
git commit -m "feat(app): compose and wire up landing page V2, remove old static page"
```

---

## Task 14: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Lint**

Run: `pnpm --filter @basketeasy/app lint`
Expected: no errors. If `framer-motion`'s `motion.button` or `@react-three/fiber`'s JSX intrinsics (`<ambientLight>`, `<pointLight>`) trigger `react/no-unknown-property` or similar false positives, fix by confirming the ESLint config already covers JSX-in-TSX (it does, per `app/.eslintrc` extending `@vitejs/plugin-react`'s recommended config) — do not disable rules project-wide to work around a single file; use a targeted `// eslint-disable-next-line` with a comment explaining why, only if a genuine false positive appears.

- [ ] **Step 2: Format check**

Run: `pnpm format:check`
Expected: no diffs. If any new file fails, run `pnpm format` and re-check.

- [ ] **Step 3: Full test suite**

Run: `pnpm --filter @basketeasy/app test`
Expected: PASS, all landing/ tests plus the rest of the existing suite green.

- [ ] **Step 4: Type-check and build**

Run: `pnpm --filter @basketeasy/app build`
Expected: `tsc -b && vite build` completes with no errors (this both type-checks and produces a production bundle, catching issues the dev server would silently tolerate).

- [ ] **Step 5: Manual browser verification**

Start the dev server and visually confirm, per the design doc's "Key Performance & Quality Criteria":
- The hero renders the WebGL basketball on a desktop-width viewport and reacts to mouse movement.
- Resizing to a mobile width (or enabling "prefers reduced motion" in devtools) swaps the hero to the static gradient fallback — no canvas, no console WebGL errors.
- Scrolling through the CTC comparison section pins and wipes as described (desktop, no reduced-motion).
- The presence sandbox toggle buttons update the counter.
- The footer's RGPD line and "Connexion club" link (navigates to `/login`) are present; Contact/Mentions légales/Politique de confidentialité are plain text.
- No console errors from GSAP, Lenis, or Three.js on load or during scroll.

- [ ] **Step 6: Commit any fixes from this pass**

If steps 1-5 required code changes, commit them:

```bash
git add -A
git commit -m "fix(app): address lint/format/build issues from landing page V2 verification"
```

If no changes were needed, skip this step — there's nothing to commit.
