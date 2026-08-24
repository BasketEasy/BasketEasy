# BasketEasy Landing Page V2 — Design

## Context

Replaces the current static [`LandingPage.tsx`](../../../app/src/pages/LandingPage.tsx) with an animation-driven marketing page per the client-supplied spec: WebGL hero, scroll-driven CTC comparison, bento feature grid, and a live presence-toggle sandbox. This is the first use of Three.js/R3F, GSAP, Lenis, and Framer Motion in the project — none were previously decided in [`docs/frontend-stack.md`](../../frontend-stack.md).

## Decisions made during brainstorming

- **Full spec scope**, not a scoped-down version — new heavy dependencies accepted.
- **Feature honesty preserved**: unbuilt features keep the `Badge variant="secondary"` "Bientôt" convention from today's page (per CLAUDE.md's "What's deliberately not here yet").
- **Sandbox is fake/local-state only** — no API calls, no auth required to interact.
- **Hero layout**: centered text overlay on the WebGL canvas (headline/subhead/CTAs centered, basketball rendered behind/around, not beside).
- **CTC comparison**: scroll-driven wipe (GSAP ScrollTrigger pins the section, a vertical divider animates left→right as the user scrolls, revealing the clean unified view over the blurred chaos). Not a user-draggable handle.
- **Presence demo deduplicated**: the spec described this feature twice (a compact "Interactive Presence Simulator" in Bento Card 1, and the full roster sandbox in Section 5 with concrete JSX). Only one interactive demo ships — the full Section 5 sandbox. Bento Card 1 becomes a static feature tile (still 2-span) describing presence tracking, no second live toggle.

## Architecture

New directory `app/src/pages/landing/`, one file per section (matching the spec's component names), composed by a slim `LandingPage.tsx`:

```
app/src/pages/landing/
  LandingPage.tsx       # composes sections, unchanged route (/, via existing router)
  Navbar.tsx
  Hero.tsx               # WebGL canvas + centered overlay
  HeroCanvas.tsx          # R3F scene, isolated so it can be mocked in tests and lazy-loaded
  CTCComparison.tsx       # GSAP ScrollTrigger pinned wipe
  BentoGrid.tsx
  PresenceSandbox.tsx     # the one interactive demo (Section 5 in the spec)
  Footer.tsx
  data.ts                 # FEATURES/HIGHLIGHTS-equivalent copy + sandbox sample roster
  useSmoothScroll.ts       # Lenis setup, mounted once at LandingPage level
```

The old `app/src/pages/LandingPage.tsx` and its test file are removed; `app/src/pages/landing/LandingPage.tsx` takes over the same route registration.

## Dependencies

Added to `app/package.json`: `three`, `@react-three/fiber`, `@react-three/drei`, `gsap`, `@studio-freight/lenis`, `framer-motion`. First-time additions — `docs/frontend-stack.md`'s "Open decisions" section gets a note recording the choice and why (matches CLAUDE.md's instruction to update stack docs when adding a library).

## Section behavior

- **Navbar**: fixed, glassmorphic dark bar (`bg-[#12100E]/70` + `backdrop-blur-md`), matches current auth-aware CTA logic exactly (`useAccount()` → "Mon espace" vs "Se connecter"/"Créer un compte"), just restyled dark. Center pill badge "Pensé pour les CTC & Ententes" in `bleu-secondaire`.
- **Hero**: `HeroCanvas` renders an R3F basketball reacting to pointer velocity; `prefers-reduced-motion` or `navigator.hardwareConcurrency <= 4` or viewport `< 768px` swaps it for a static pre-rendered gradient/ball image (no Canvas mount at all) — this is the spec's required mobile degradation path, implemented as a capability check rather than a runtime FPS monitor (simpler, deterministic, testable). "Tester la démo live" smooth-scrolls (via the shared Lenis instance) to the sandbox section id; "En savoir plus" scrolls to the CTC comparison section.
- **CTCComparison**: GSAP ScrollTrigger pins the section and drives a clip-path wipe from the blurred/chaotic left image to the crisp BasketEasy view as scroll progress advances. Falls back to a static side-by-side (no pin, no wipe) under `prefers-reduced-motion`.
- **BentoGrid**: 4 tiles, spans per spec (2/1/1/2). Tile 1 (presence tracking) and Tile 2 (calendars/results sync) get "Bientôt" badges — matches today's `HIGHLIGHTS` treatment of the same underlying features. Tile 3 (RGPD/hosting) and Tile 4 (built-for-volunteers philosophy) are statements of current fact/positioning, not future features — no badge.
- **PresenceSandbox**: the spec's provided JSX, adapted to the project's `@basketeasy/ui` primitives where they exist (buttons) and Framer Motion for the tap animation on the status toggle, exactly as spec'd. Pure `useState`, no API calls.
- **Footer**: dark charcoal, large `BASKETEASY` banner, required "Données hébergées en France · RGPD" line. Of the four nav links, only **Connexion Club** points somewhere real (`/login`, an existing route) and is a working link; **Contact**, **Mentions Légales**, and **Politique de Confidentialité** have no pages yet, so they render as non-interactive text (not `href="#"` dead links) — same "don't imply functionality that isn't there" principle CLAUDE.md's existing landing-page comment establishes, extended to footer nav.

## Testing

`HeroCanvas` and any direct `@react-three/fiber`/`three` usage is isolated to its own file so it can be mocked in tests (jsdom has no WebGL context) — tests render `Hero` with `HeroCanvas` mocked to a stub `<div>` and assert on the overlay content/CTAs instead. GSAP ScrollTrigger and Lenis are guarded behind `useEffect`/`typeof window` checks already required for their browser-only APIs, so they no-op harmlessly under jsdom without additional mocking. Colocated `*.test.tsx` per component per existing convention, covering: nav auth-aware CTAs, badge presence on the still-unbuilt features, sandbox toggle state/counter, footer's real vs. placeholder links, and the reduced-motion/low-concurrency hero fallback branch.

## Out of scope

Actual FPS profiling/monitoring (the spec's "maintain 60 FPS" is a manual verification target, not an automated gate), CMS-driven copy, real Contact/Mentions Légales/Politique de Confidentialité pages, i18n (page stays French-only per existing convention).
