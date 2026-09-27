# Parents (guardians): Part 3, frontend (linking)

Status: spec (implements Part 3 of [`2026-09-27-parent-guardian-design.md`](./2026-09-27-parent-guardian-design.md))
Date: 2026-09-27

Every screen that creates, shows or removes a guardian link: the admin's « Parents » dialog and
column, the public invite page, the child's profile and the two account-page sections. Consumes
Part 1's endpoints only; acting as a child (the switcher, `forPlayerId` in hooks) is Part 4. The
screens follow the validated canvas linked from the design doc.

## 1. Admin: `GuardiansDialog` and the « Parents » column

- `app/src/clubs/usePlayerGuardians.ts` (`GET …/players/:playerId/guardians`, enabled only while
  the dialog is open, like `usePlayerInviteStatus`), `useGuardianInviteMutations.ts` (create,
  cancel) and `useRemoveGuardian.ts`. Each mutation invalidates the guardians query and the
  club's players list (`guardianCount`). Keys in `queryKeys.ts`:
  `clubPlayerGuardiansQueryKey(clubId, playerId)`.
- `GuardiansDialog` (`@basketeasy/ui/dialog`, mirrors `PlayerInviteDialog`):
  - Trigger: `Button variant="outline"` « Parents (n) », or « Inviter un parent » at zero.
  - Body, `error → loading → empty → data`:
    - Linked parents: name (or e-mail when the account has none), e-mail as `meta`, « Consentement
      donné le … » when `consentGivenAt`, « Retirer » (`variant="ghost"`) which asks inline
      (« Retirer l'accès de Sophie Martin ? » + « Confirmer » / « Annuler ») before calling. Not a
      nested dialog: the one-modal rule.
    - Pending invites: « Lien envoyé le … · expire le … » with « Annuler ».
    - « Générer un lien » → the fresh URL in a read-only `Input` with « Copier » (clipboard →
      toast « Lien copié »), plus the reminder that the link is shown once. Disabled with a
      `meta` line at 4 guardians or 4 pending invites (`MAX_…` from `@basketeasy/types/guardians`).
  - Every mutation outcome is a `toast()`; server 400 copy comes through
    `getClubErrorMessage`.
- `PlayerRow` renders `GuardiansDialog` next to the existing invite control, at both layouts
  (`useTableLayout()` branch already exists). `MembersPage`'s players `ResponsiveTable` gains a
  « Parents » column holding it; the card layout shows it in the action row.

## 2. Public invite page: `/guardian-invite/:token`

Top-level route beside `/invite/:token` (opened from a message; a stale session must not be
bounced).

- `app/src/guardians/useGuardianInvitePreview.ts`, `useAcceptGuardianInvite.ts` (register path:
  stores the session like `useAcceptPlayerInvite`), `useAcceptGuardianInviteAsMe.ts`.
- `GuardianInvitePage`: preview card « Suivre **Léo Martin** · U11 Filles · ASBC Rezé ». Preview
  errors: 404 → « Ce lien n'est plus valide… », 409 `INVITE_ALREADY_ACCEPTED` → « Ce lien a déjà
  été utilisé » with a link to `/login`.
- Logged in (`useAccount().user`): one card « Continuer en tant que <e-mail> », the consent
  fieldset when `requiresConsent`, « Suivre Léo », and « Ce n'est pas vous ? Se déconnecter ».
  On success → toast-free navigate to `/dashboard` (the landing page reads the new persona from
  Part 4 on; until then the account page's « Mes enfants » lists the child).
- Logged out: `Tabs` « Créer un compte » / « J'ai déjà un compte ».
  - `GuardianInviteRegisterForm`: first name, last name, e-mail, password, consent when
    required. react-hook-form + zod (`guardianInviteSchema.ts`, shared consent rule: required
    `true` when `requiresConsent`). On success the session is stored and the user lands on
    `/dashboard`.
  - « J'ai déjà un compte »: the existing `LoginForm` with a `redirectTo` back to this page, so
    the logged-in card takes over after login.
- Consent fieldset copy: « J'autorise Léo à participer aux activités du club et je confirme être
  son représentant légal. » Errors via `setError('root')` + `Alert` (auth-form convention);
  `PARENTAL_CONSENT_REQUIRED` is mapped onto the checkbox field instead.

## 3. Child profile: `/children/:playerId`

Protected route. `app/src/guardians/useMyChild.ts` (`GET`), `useUpdateMyChild.ts` (`PATCH`),
`useStopFollowingChild.ts` (`DELETE`).

- `ChildProfilePage`, `error → loading → data` (404 → the not-found copy):
  - Card « Profil »: `ChildProfileForm` (react-hook-form + zod: first name, last name, birth date,
    gender `SelectField`), « Enregistrer » → toast.
  - Card « Licence et équipes » (read-only): club, team names, and « Le numéro de licence et les
    équipes sont gérés par le club. »
  - Card « Parents »: co-guardians' names only, and the consent record (« Autorisation parentale
    donnée le … par … »).
  - Destructive: « Ne plus suivre Léo » → `Dialog` confirm → navigate to `/account`, toast.

## 4. Account page

- « Mes enfants » (only when `usePersonas().children.length > 0`; the hook lands here, over
  `GET /me/personas`, and Part 4 reuses it): one `TextLink` per child to `/children/:id` with the
  club/team line.
- « Accès parents » (only for a user whose own `Player` has guardians): one
  `GET /me/players/:playerId/guardians` per id in `usePersonas().self.playerIds`. Each guardian
  row has « Retirer » behind a `Dialog` confirm, **hidden** while `isMinor` (the server refuses
  anyway; a minor sees the list with « Tes parents peuvent répondre pour toi. »).

## 5. Tests (Vitest + RTL) and screenshots

- `GuardiansDialog.test.tsx`: lists guardians and pending invites, generates and copies a link,
  cancel/remove call the API, cap disables generation, error branch never shows the empty state.
- `GuardianInvitePage.test.tsx`: preview errors, consent shown only when required and enforced,
  register path posts names, logged-in path posts `accept-as-me`.
- `ChildProfilePage.test.tsx`: edits, co-guardians without e-mails, stop following.
- `AccountPage.test.tsx`: « Mes enfants » and « Accès parents » visibility rules; no « Retirer »
  for a minor.
- MSW handlers in `app/src/mocks/handlers.ts` get empty defaults for every new endpoint, and
  `scripts/fixtures/guardians.json` covers the admin dialog, the invite page and the child
  profile. Screenshots at 390 and 1280.
