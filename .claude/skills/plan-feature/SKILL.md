---
name: plan-feature
description: How a Kluvo feature goes from a product ask to merged PRs - the decision table, splitting into shippable parts, the Claude Design canvas gate, PR descriptions, and where durable decisions are recorded afterwards. Use when asked to design, spec, plan, scope or break down a feature or screen, or before starting any change that spans backend and frontend or more than one PR.
---

# Plan a feature

Kluvo used to keep one spec file per part of every feature (82 of them). They went stale the day
the code merged and contradicted `CLAUDE.md`. The process below keeps what made them useful and
drops the files.

## 1. Read before proposing

- `CLAUDE.md` (rules), the domain's file in `docs/decisions/` (why things are the way they are,
  open questions), `docs/personas.md` for anything a player or parent sees, `docs/ui-guidelines.md`
  for any screen.
- Read the code the feature touches. Most corrections to past plans came from code the plan
  assumed (« the roster already has the invite action »: it didn't). Write down every such
  correction; it goes in the PR description.

## 2. Settle the decisions with the product owner first

Put the open questions in a table: question, proposed decision, rejected alternative and why.
Ask before building when an answer changes the data model, who can see or do something, or what a
notification says. Everything else, pick a sensible default and list it under « Defaults decided
without asking » so it is visible and reversible. Name what is **out of scope**, so nobody builds it
speculatively.

Keep the plan in the conversation or the PR description, not in a committed spec file.

## 3. Split into parts that each ship alone

- Each part is one PR that leaves `main` green and working. Typical order: schema + shared types +
  backend, then each screen. Large efforts use stacked branches, each PR retargeted to `main` once
  its base merges.
- Within a part, contract changes go `packages/@basketeasy/types` → NestJS DTO → frontend caller.
- Schema changes are hand-written migrations (no Postgres in the sandbox), then
  `prisma generate`. Anything the database must enforce (cascade, `FOR UPDATE`, unique under
  concurrency) gets a `server/test/db/*.db-spec.ts` case.
- Backend work follows the `backend-slice` skill. Anything touching personal data, minors, auth or
  audit runs the `privacy-review` skill before the PR.

## 4. Design gate for UI

1. A Claude Design canvas at 390 and 1280, artboards started from `docs/design-kit/artboard-*.dc.html`
   (the Parquet canvas kit: every class there maps to a real component and prop). Get it validated.
2. In the plan, a **mockup class → component and props** table. A look the components can't express
   becomes a new variant or token (`tailwind-preset.cjs`), never a call-site class or arbitrary value.
3. When the canvas conflicts with `CLAUDE.md` or `docs/ui-guidelines.md`, the rule wins; say so in
   the PR. Copy French strings from the validated canvas verbatim.
4. Link the canvas URL from the PR. Don't commit canvas sources or screenshots to `docs/`.
5. Build, then screenshot at 390 and 1280 against the artboard (`screenshot-ui` skill, fixtures in
   `scripts/fixtures/`, committing a new fixture when the scenario will recur).

## 5. The PR

- Template sections filled from the diff (`.github/pull_request_template.md`). The description
  covers the whole diff, including fixes picked up on the way.
- `pr-scope.yml` flags diffs touching `server/src/auth`, `server/src/retention`,
  `server/src/audit` or `server/prisma`: name every schema, guard, audit and behaviour change.
- List the corrections from step 1 and any deviation from the canvas.

## 6. After it lands: record, don't archive

In the **same PR** as the behaviour change:

- `CLAUDE.md`: the rules an agent must follow in that module (short, imperative, with the reason in
  one clause). Update « What's deliberately not here yet ».
- `docs/decisions/<domain>.md`: the decision table, rejected alternatives, verified external facts,
  open questions. Create a new domain file only for a genuinely new domain, and add it to
  `docs/decisions/README.md`.
- `docs/ui-guidelines.md` when a new screen pattern landed.
- Code comments point at `docs/decisions/<file>.md`, never at a plan, a PR number alone, or a file
  that won't survive.

Nothing else from the plan is kept.
