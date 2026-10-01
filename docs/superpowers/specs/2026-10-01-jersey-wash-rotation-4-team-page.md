# Jersey wash rotation, part 4: team page rotation and exemptions

**Status:** spec, not built. **Date:** 2026-10-01. **Design:** [`2026-10-01-jersey-wash-rotation-design.md`](./2026-10-01-jersey-wash-rotation-design.md) (decisions 5, 7, 13, 14, 15, « Frontend »). **Depends on:** part 1 merged (the overview route and the two new manager fields). Independent of parts 2 and 3. **Canvas:** [Claude Design](https://claude.ai/artifact/WfheFmiZ484WwFcmHRzvb7), validated.

**One PR.** Built **pixel for pixel** from the two artboards below; the PR attaches the 390 screenshots side by side with them, plus 1280 shots.

## Artboards

| State                                            | Artboard                                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Player (and guardian) view                       | [`Equipe.dc.html`](./assets/2026-10-01-jersey-wash-rotation/Equipe.dc.html) « Équipe · rotation (joueuse) »           |
| Manager view: exemption toggles, rotation switch | [`Equipe-coach.dc.html`](./assets/2026-10-01-jersey-wash-rotation/Equipe-coach.dc.html) « Équipe · rotation (coach) » |

## Corrections to the design

| Design says                                                                       | Code / canvas says                                                                                                                                                                   | Spec decision                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| « a « Lavage des maillots » section on the team page »                            | `TeamDetailPage` is a `PageHero` over `?tab=` `Tabs` (managers: roster, clubs, admins, stats, events; players: events, roster, stats). There is no tab-free area to put a section in | New tab **« Maillots »** (`?tab=maillots`) holding the section, in both tab sets. Players and guardians see it only while the rotation is on; managers always (the switch lives there).                                                                      |
| « a `ResponsiveTable` per player … manager-only exemption toggle inline per row » | Both artboards draw **list rows** (avatar, name, meta, trailing), and the two views have different trailing content (count vs switch)                                                | `ResponsiveTable list` with one record component `JerseyRotationRow` branching on `useTableLayout()` and on `canManage` (CLAUDE.md « Responsive tables »: one component, not a pair).                                                                        |
| « Exempté » toggle                                                                | No switch primitive exists in `@basketeasy/ui` (`Checkbox` only); the artboard draws a `role="switch"`                                                                               | New `@basketeasy/ui/switch` over `@radix-ui/react-switch` (CLAUDE.md « Use a dependency »: Radix is already the primitive library), composing `focusRing`, its track/thumb colours as tokens in `tailwind-preset.cjs`. Recorded in `docs/frontend-stack.md`. |
| `PATCH players/:teamPlayerId`                                                     | The route is keyed by `Player.id`                                                                                                                                                    | Part 1 puts `playerId` on every `JerseyRotationRow`.                                                                                                                                                                                                         |

## Deviations from the canvas (the rule wins, say so in the PR)

1. **The page header stays the team's `PageHero`.** The artboards draw a bare eyebrow « Équipe · saison 2026-2027 » over « U13 F »; the real page's hero (club eyebrow, team name, fact tile) is unchanged. The season moves into the section: `SectionHeading` « Lavage des maillots » followed by `Text variant="meta"` « Saison 2026-2027 ».
2. **Row order follows the rule, not the sample data.** The artboards list Emma M. (1 lavage, 27 sept.) before Chloé R. (1 lavage, 20 sept.), which contradicts decision 5 (longest since last turn first) and the footnote the same artboard prints. Rows come from the server in suggestion order, exempted last.
3. **Desktop** (no 1280 artboard): the table mode of `ResponsiveTable` with columns « Joueuse », « Lavages », « Dernier lavage », and for a manager « Exemptée »; the rotation switch stays below the table.

## Screen (`app/src/jersey-duty/TeamJerseyRotationSection.tsx`)

Data: `useJerseyRotation(clubId, teamId)` → `GET …/jersey-rotation` with `forPlayerId` from `useTeamActingAs` (persona last in the key). `error → loading → empty → data`; empty = a roster with nobody on it: `EmptyState` « Aucune joueuse dans l'effectif. » (gendered helper).

Top to bottom:

1. `SectionHeading as="h2"` « Lavage des maillots », meta « Saison 2026-2027 ».
2. Next-match tile, `Card variant="inset" tone="structure"`: `IconBadge` + `JerseyIcon`, meta « Prochain match · sam. 4 oct. », label « Suggestion : Emma M. ». With a holder: « Lavage : Emma M. ». Empty pool: « Aucune suggestion pour l'instant ». No upcoming match: the tile is not rendered. The tile links to the match (`ListItem asChild` over a `Link`, or `TextLink` on the label if the inset card can't host a row; pick whichever needs no new class).
3. `Card variant="flush"` › `ResponsiveTable list columns={…}` › `JerseyRotationRow` per row:

| View (`canManage`) | `leading`                             | title                         | `meta`                                     | `trailing`                                                                                           | Artboard       |
| ------------------ | ------------------------------------- | ----------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------- |
| player / guardian  | `Avatar` (`tone="brand"` when `isMe`) | « Léa G. (vous) » when `isMe` | « Dernier : 27 sept. » / « Dernier : — »   | `Badge` « Exemptée » (soft muted) when exempt, then the count in `Text variant="display"` `.tabular` | `Equipe`       |
| manager            | `Avatar`                              | « Emma M. »                   | « 1 lavage · 27 sept. » / « 0 lavage · — » | label « Exemptée » + `Switch` `aria-label="Exempter Emma M."`                                        | `Equipe-coach` |

Above the rows in the player view, the artboard's column header « Joueuse · Lavages » (eyebrow). `ResponsiveTable` in `list` mode renders no header today: add an opt-in `listHeader` that renders `columns` as an eyebrow row in list mode (a variant on the component, never a call-site header). The manager artboard has no header: don't pass it there. 4. Player view footnote, `Text variant="meta"`: « Ordre de suggestion : le moins de lavages, puis le plus ancien. » 5. Manager view, below the card: label « Rotation activée », meta « Désactivez si le club lave les maillots. », `Switch` `aria-label="Rotation activée"`.

Gendered words (« Joueuse », « Exemptée », « Aucune joueuse ») go through `jerseyDutyCopy.ts` with `teamGender` (created in part 3; if part 4 lands first, it creates the helper and part 3 extends it). Counts: « 0 lavage », « 1 lavage », « 2 lavages ». Dates « 27 sept. » through the existing Paris formatters.

### Mockup class → component

| Canvas class                      | Component and props                                                           |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `eyebrow` + `h1` (page head)      | existing `PageHero` (deviation 1)                                             |
| `sh`                              | `SectionHeading as="h2"`                                                      |
| `inset inset-structure`, `icb`    | `Card variant="inset" tone="structure"`, `IconBadge` + `JerseyIcon`           |
| `card` + `ul` + `row`             | `Card variant="flush"` › `ResponsiveTable list` › `ListItem` (via the record) |
| `av` / `av av-me`                 | `Avatar` + `AvatarFallback tone="structure"` / `tone="brand"`                 |
| `b` / `t-sm muted` / `t-xs muted` | `ListItem` title / `meta` / `Text variant="meta" size="xs"`                   |
| `badge bd-muted`                  | `Badge variant="soft" tone="muted"`                                           |
| `display tabular`                 | `Text variant="display"` + `.tabular`                                         |
| `switch`, `switch-on`             | new `Switch` (`@basketeasy/ui/switch`)                                        |

## Mutations

- **Exemption:** `PATCH …/players/:playerId { jerseyDutyExempt }` through a new `useTeamPlayerUpdate` (or the existing role-update hook generalised, if one exists: reuse rather than add). Inline, optimistic: flip the row, roll back on error. One-field inline control per CLAUDE.md « Modals vs. inline », still through react-hook-form (`Controller` around `Switch`, submit on change). Toasts: « Emma M. est exemptée. » / « Emma M. n'est plus exemptée. »; failure as a destructive toast.
- **Rotation switch:** `PATCH …/teams/:teamId { jerseyRotationEnabled }`, same pattern. Toasts « Rotation activée. » / « Rotation désactivée : les matchs reprennent « Qui apporte les maillots ? ». ». Turning it off is reversible and rewrites nothing (part 1), so no confirm dialog.
- Both invalidate the rotation overview, the duty prefix and the team's events prefix (the match card and agenda chip switch between duty and plain slot).

## Fixtures and screenshots

`scripts/fixtures/jersey-rotation-team.json`: `GET …/jersey-rotation` reproducing the artboards' roster (Inès B., Léa G., Emma M., Chloé R., Manon T., Jade L., Sarah K. exempted; next match sam. 4 oct., suggestion Emma M.), with a manager variant (`canManage: true`) on top of `team-detail-manager.json`. `screenshot-ui` skill, 390 and 1280, `?tab=maillots`.

## Tests

`TeamJerseyRotationSection.test.tsx`: both views, error / loading / empty branches, `(vous)`, exempt badge, footnote, next-match tile variants, switch calls with `playerId`, optimistic rollback, tab hidden for a player when disabled. `Switch.test.tsx` + story (keyboard, `aria-checked`, focus ring). `ResponsiveTable.test.tsx`: `listHeader`. `TeamDetailPage.test.tsx`: the `maillots` tab for each persona.

## Docs in the same PR

`docs/ui-guidelines.md`: the `Switch` control and when to use it over a `Checkbox` (an immediate, persisted on/off setting vs a form field submitted later). `docs/frontend-stack.md`: `@radix-ui/react-switch`. `CLAUDE.md`: the `maillots` tab beside the existing `?tab=` exception note. Delete this spec file.

## Out of scope for this part

A season picker (the route takes `?season=`; the UI shows the current season only), editing past turns from this screen (that is the match card's « Changer » / « Annuler ce tour »), and everything in the design's « Out of scope ».
