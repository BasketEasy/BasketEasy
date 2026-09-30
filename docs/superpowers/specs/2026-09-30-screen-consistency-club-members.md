# Screen consistency: Club (`/clubs/:clubId/members`)

Status: plan (screen 3 of [`2026-09-30-screen-consistency-design.md`](./2026-09-30-screen-consistency-design.md))
Date: 2026-09-30
Design: [canvas](https://claude.ai/artifact/B3Fd4kEVqfQMhaMPfXtVpd), artboard « Club · effectif » (390).
Depends on: Part 0 (`PageHero`, `FactTile`).

Page type: **entity, tab root** (the « Club » bottom-nav destination): hero, no page bar. Files:
`app/src/pages/MembersPage.tsx`, `app/src/clubs/ClubFfbbLinkControl.tsx`,
`app/src/meeting-points/ClubMeetingPointSettings.tsx`.

## 1. Today

`h1` « Effectif · {club name} », then the FFBB control as a loose row of badge + mono code +
buttons, then the club RDV settings block (own `SectionHeading`), then three tabs whose content each
sits in a `Card` + `CardContent`. `ClubFfbbLinkControl` carries two closed-API breaks:
`className="max-w-[220px]"` (arbitrary value) on its `Input` and `className="font-mono"` on a `Text`.

## 2. Changes

### 2.1 Hero

`PageHero`:

- badges: `Badge variant="soft" tone="structure"` « FFBB {code} » when `club.ffbbClubCode` is set.
- eyebrow « Club », title `club.name` (the « Effectif · » prefix goes: the tabs say what the page
  lists).
- meta « {membersResult.total} membres · {playersResult.total} joueurs · {teamsResult.total}
  équipes », `.tabular`. The three list queries already run on mount for an admin (they are not
  tab-gated), so the totals cost nothing; render a part only once its total is known.
- aside: the FFBB fact tile. The club code is **optional and drives nothing** (stored unvalidated,
  `ClubsService.setFfbbLink`), so a missing code is **not** an accent tile (rule 3 is for a fact
  the reader must fix):
  - linked: `FactTile icon={<LinkIcon/>} label="Code club FFBB" detail={code}` + actions « Modifier »
    (`outline sm`) and « Retirer » (`ghost sm`, same mutation and toast as today);
  - not linked: `FactTile label="Aucun code club FFBB" detail="Facultatif : le code de la page du club sur competitions.ffbb.com."`
    - « Ajouter le code » (`outline sm`);
  - editing: the tile's body becomes today's inline react-hook-form (`Input` + Enregistrer / Annuler,
    `FieldError`, help text). Keep it inline: one field, low risk, frequent enough (CLAUDE.md
    « Modals vs. inline editing »).
- Fix the two closed-API breaks while rewriting the file: the `Input` width goes to `max-w-56`
  (layout, Tailwind scale, 224px), the code is `Text` without `font-mono` (add a `mono` variant to
  `Text` only if review wants it back; it is the one monospace string in the product).
- The FFBB control moves into the hero, so `ClubFfbbLinkControl` is reshaped into the tile's content
  (`ClubFfbbFactTile`), not wrapped by it; rename the file and its test accordingly.

### 2.2 Tabs

Unchanged triggers, `?tab=` behaviour and `?invite=` dialog. Add the count badge each tab's list
already knows (`TabsTrigger badge={…total}`), as the team page does. Each tab's `Card` +
`CardContent` wrapper stays (the list needs a surface; `ResponsiveTable` owns rows).

### 2.3 Settings

Below the tabs: `section` « Réglages du club » (`SectionHeading as="h2"`) holding one
`SectionAccordion` item `rdv`, title « RDV par défaut », content `ClubMeetingPointSettings
headingless` (same prop as the team's settings components, same `panel` → plain `div` rule), no
summary (its query stays inside, Part 5 rule). Folded by default.

The « Retirer » member error `Alert` (`removeError`) stays where it is, above the tabs; it is a
form-level refusal bound to a row the reader just clicked, not a completed mutation. Out of scope
to turn into a toast.

## 3. Tests

- `MembersPage.test.tsx`: `h1` = club name; FFBB badge + tile when linked, neutral add-tile when not;
  editing the code still sets / clears it and shows the field error; meta totals; tab badges;
  `?tab=players` and `?invite=` unchanged; « RDV par défaut » folded, opening it renders the settings
  (error branch via MSW); non-admin still gets `ForbiddenPage`.
- `ClubFfbbFactTile.test.tsx` (renamed from `ClubFfbbLinkControl.test.tsx`).

## 4. Screenshots

390 and 1280, club with and without FFBB code, « RDV par défaut » open once. Fixture:
`scripts/fixtures/club-roster-with-minors.json` (already carries a club, members and players).
