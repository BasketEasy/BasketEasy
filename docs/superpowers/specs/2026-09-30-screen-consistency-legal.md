# Screen consistency: pages légales

Status: plan (screen 15 of [`2026-09-30-screen-consistency-design.md`](./2026-09-30-screen-consistency-design.md))
Date: 2026-09-30
Design: [canvas](https://claude.ai/artifact/B3Fd4kEVqfQMhaMPfXtVpd), artboard « Pages légales » (390).
Depends on: Part 0 (`PageHeader`).

Page type: **standalone** (public, `PublicHeader` chrome). Four routes, one layout:
`/mentions-legales`, `/confidentialite`, `/cgu`, `/registre-traitements`, all through
`app/src/pages/legal/LegalPageLayout.tsx` and the `LegalSection` / `LegalSubHeading` helpers in
`legalContent.tsx`. The content (legal text) is not touched.

## 1. Today

`Heading as="h1"` + « Dernière mise à jour » meta, a wrapped row of `TextLink`s between the four
documents (the current one as a brand-toned label), then sections.

## 2. Changes

- Title block → eyebrow « Documents légaux » + `PageHeader title meta="Dernière mise à jour :
{date}"` (`.tabular` on the date) inside the `max-w-3xl` column.
- **Document switcher**: keep it a `nav` of links (these are four routes, not tabs of one page, so
  `role="tab"` would be wrong), but give it the segmented look the canvas draws, by adding a
  `SegmentedNav` variant to the existing `SegmentedControl` only if it can render links; otherwise
  keep the `TextLink` row as is. Decide in the PR with a screenshot of both; no new primitive for
  four links.
- `LegalSection` already renders `SectionHeading` (rule 4 holds); `LegalSubHeading` stays an `h3`.
  No change in `legalContent.tsx`.
- The registre's `LegalTable` is unchanged.

## 3. Tests

A `LegalPageLayout` test: one `h1`, the current document is not a link, the other three are.

## 4. Screenshots

390 and 1280 of `/confidentialite` and `/registre-traitements` (the table).
