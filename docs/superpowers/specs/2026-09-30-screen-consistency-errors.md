# Screen consistency: error pages (404, 403, error boundary)

Status: plan (screen 14 of [`2026-09-30-screen-consistency-design.md`](./2026-09-30-screen-consistency-design.md))
Date: 2026-09-30
Design: [canvas](https://claude.ai/artifact/B3Fd4kEVqfQMhaMPfXtVpd), artboard « 404 · 403 » (390).
Depends on: nothing.

Page type: **standalone** inside whatever chrome the route has. Three screens, one shape, one plan:
`app/src/pages/NotFoundPage.tsx` (`*`, `/clubs/*`, `/admin/*`), `app/src/pages/ForbiddenPage.tsx`
(non-admin on `/clubs/:clubId/members`), `app/src/components/AppErrorBoundary.tsx` (render crash).

## 1. Today

Three near-identical hand-built stacks (`div.flex.flex-col.items-center.gap-4.text-center` in a
centred `PageContainer`): the 404 has a `Text variant="display"` « 404 » with `className="text-5xl"`
(a size passed as a class to a `Text` that has a `size` axis: closed-API break), the 403 and the
boundary have none. No surface: the text sits on `ground`.

## 2. Changes

- New `app/src/components/ErrorScreen.tsx`: `PageContainer size="md" centered` → `Card
className="flex flex-col items-center gap-5 p-6 text-center"` → `IconBadge tone="accent"` (`IconBadge` has no size axis; the canvas's
  56px disc needs `size: { md, lg }` added to it, never `h-14 w-14` at the call site; or keep 40px) with `WarningIcon`, `Text variant="eyebrow"`{code label}, `Heading as="h1"`,
  `Text variant="meta"`, then the action `Button asChild` full width.
- 404: eyebrow « Erreur 404 », title « Page introuvable », action unchanged (« Retour au
  tableau de bord » → `/dashboard`). The `text-5xl` display numeral goes (the eyebrow carries the code).
- 403: eyebrow « Erreur 403 », title « Accès non autorisé », same copy and action as today.
- Boundary: eyebrow « Erreur », title « Une erreur est survenue », its current « Recharger la page »
  button (`window.location.reload()`). It wraps `<Routes>`, so `ErrorScreen` must not require a
  `Link`: it takes `action` as a node.

## 3. Tests

`NotFoundPage.test.tsx`, `AppErrorBoundary.test.tsx`: one `h1`, the action's name and target
unchanged; new `ForbiddenPage` test if absent.

## 4. Screenshots

390 and 1280 of each, inside the app chrome (404 under `/clubs/x`) and in the admin shell (404 under
`/admin/x`).
