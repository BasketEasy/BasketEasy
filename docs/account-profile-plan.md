# Account profile (name, avatar) + auto-fill on player creation

Implementation plan. Not yet built — captured here for delegation.

## Context

Today `User` (`server/prisma/schema.prisma`) has only `email`/`passwordHash` — no name or picture. `Player` (the roster entry) already has its own required `firstName`/`lastName` plus an optional `userId` link to a `User`, and `PlayerCreateForm` already lets an admin pick a "linked account" from the club's members (`ClubMember[]`, keyed by email only) — but today linking an account does **nothing** for the name fields; the admin still types them by hand. The goal is an account-level profile (first name, last name, profile picture) that a member fills in once, so that when a club admin adds that member as a player and links their account, the name is pulled in automatically instead of retyped.

Scoped per product decisions so far:

- Profile picture is a plain `avatarUrl` string field — no upload pipeline/S3 infra in this pass.
- No extra fields beyond first/last name + avatar URL for now.
- Registration stays email+password only; name/avatar are set afterward on a new profile page.
- Auto-fill pre-populates the player name fields when a linked account is chosen, but they stay editable.
- The account/profile page is the landing page the first time a member logs in (profile incomplete), not `/dashboard`.

## Backend

1. **Shared types first** (`packages/@basketeasy/types/auth.ts`):
   - Add `firstName: string | null`, `lastName: string | null`, `avatarUrl: string | null` to `User`.
   - Add `UpdateProfileRequest { firstName?: string; lastName?: string; avatarUrl?: string | null }`.

2. **`packages/@basketeasy/types/club-members.ts`**: add `firstName: string | null`, `lastName: string | null` to `ClubMember` — this is how the frontend gets the name to pre-fill without an extra request (the linkable-members list already returned by `GET /clubs/:id/members` is what `PlayerCreateForm` consumes).

3. **Prisma schema** (`server/prisma/schema.prisma`): add nullable `firstName String?`, `lastName String?`, `avatarUrl String?` to `model User`. New migration under `server/prisma/migrations/` following the minimal-diff style of `20260808190000_add_player_user_link` (plain `ALTER TABLE "User" ADD COLUMN ...`, all nullable so no backfill needed).

4. **New `UpdateProfileDto`** (`server/src/auth/dto/update-profile.dto.ts`): mirror `UpdatePlayerDto`'s pattern — `@Transform` trim + `@IsString() @MinLength(1) @MaxLength(80)` via `ValidateIf` for `firstName`/`lastName` (optional, but if present must be non-empty), and `@IsOptional() @IsUrl()` (or `@IsString()` if avoiding strict URL validation) for `avatarUrl`, allowing `null` to clear it.

5. **`AuthService`** (`server/src/auth/auth.service.ts`):
   - Update `register()`, `login()`, and `me()` to include `firstName`, `lastName`, `avatarUrl` in the returned `User` object (all `null` on register).
   - Add `updateProfile(userId: string, data: { firstName?: string; lastName?: string; avatarUrl?: string | null }): Promise<User>` — `prisma.user.update`, then return the same `User` shape as `me()` (reuse/extract a small private mapper to avoid triplicating the `{id, email, firstName, lastName, avatarUrl, memberships}` construction across register/login/me/updateProfile).

6. **`AuthController`** (`server/src/auth/auth.controller.ts`): add `PATCH /auth/me` guarded by `JwtAuthGuard`, taking `UpdateProfileDto`, calling `authService.updateProfile(user.id, dto)`, returning `User`.

7. **`ClubsService.listMembers` / `addMember`** (`server/src/clubs/clubs.service.ts`): include `firstName`/`lastName` in the `include: { user: true }` select and in the returned `ClubMember` objects (both methods construct the object by hand today — just add the two fields from `m.user`/`user`).

8. **Tests**: extend `server/src/auth/auth.service.spec.ts` and `auth.controller.spec.ts` for the new `updateProfile`/`PATCH /auth/me` path (mock `prisma.user.update`), and `server/src/clubs/clubs.controller.spec.ts` / service spec if it asserts the `ClubMember` shape, following the existing mock-provider style (no real DB).

## Frontend

9. **New `app/src/account/` module**, mirroring `auth/`'s layout:
   - `useAccountUpdate.ts` — react-query `useMutation` calling `apiClient.patch<User>('/auth/me', body)`. On success, `queryClient.setQueryData(sessionQueryKey, updatedUser)` (same pattern `useLogin`/`useRegister` already use in `app/src/auth/mutations.ts`) so `AccountContext`'s cached user updates without a refetch. `sessionQueryKey` is exported from `app/src/auth/session.ts`.
   - `AccountProfileForm.tsx` — react-hook-form + zod, following `RegisterForm.tsx`/`PlayerCreateForm.tsx` conventions exactly (`FormField` for firstName/lastName, a plain text `FormField` for `avatarUrl` since there's no upload UI this pass, root-level `Alert` for submit errors, `Button` disabled while pending). Pre-fill `defaultValues` from `useAccount().user`.
   - `accountErrorMessages.ts` — small `getAccountErrorMessage(err)` keyed on HTTP status, matching `auth/errorMessages.ts`/`clubs/clubErrorMessages.ts`.
   - Colocated `*.test.tsx` for the form and hook using `renderWithProviders`/MSW, matching `RegisterForm.test.tsx`'s style.

10. **`app/src/pages/AccountPage.tsx`** (+ `.test.tsx`) — thin wrapper rendering `AccountProfileForm` inside a `Card`, same shape as other page components.

11. **Routing** (`app/src/App.tsx`): add `<Route path="/account" element={<AccountPage />} />` inside the existing `<ProtectedRoute>` group.

12. **`app/src/components/AppHeader.tsx`**: add a "Mon profil" button in the dropdown menu (`go('/account')`), alongside the existing "Tableau de bord"/"Créer un club" entries.

13. **Land on `/account` on first login** (`app/src/auth/PublicOnlyRoute.tsx`): today `LoginForm`/`RegisterForm` don't navigate explicitly — once a login/register mutation succeeds, `queryClient.setQueryData(sessionQueryKey, user)` makes `user` truthy, and `PublicOnlyRoute` (guarding `/login` and `/register`) redirects to `/dashboard`. Change that redirect target to `/account` when `!user.firstName` (profile not filled in yet — true right after registration), and keep `/dashboard` once a name is set. This makes the account page the landing spot the first time someone logs in, with no separate "first login" flag needed, and requires no changes to `RegisterForm`/`LoginForm`/`mutations.ts`. Update `PublicOnlyRoute.test.tsx` to cover both redirect targets.

14. **`app/src/clubs/PlayerCreateForm.tsx`** — the auto-fill behavior:
    - `linkableMembers: ClubMember[]` now carries `firstName`/`lastName` (from step 2/7).
    - In the `Select`'s `onValueChange` (via the `Controller`'s `field.onChange` wrapped, or a local handler passed to `Select`), when a member is selected and that member has `firstName`/`lastName`, call `setValue('firstName', member.firstName, ...)` / `setValue('lastName', member.lastName, ...)` (only if the member has a name set — an account with no profile filled in yet leaves the fields as-is for manual entry). Fields remain editable afterward per the chosen behavior.
    - Update `PlayerCreateForm.test.tsx` to cover: selecting a linked member with a profile name pre-fills the name fields; selecting a member without one leaves fields untouched; manual edit after auto-fill is preserved on submit.

## Verification

- `pnpm --filter @basketeasy/server test` (new/updated auth + clubs specs) and `pnpm --filter @basketeasy/app test` (new account specs + updated `PlayerCreateForm.test.tsx`).
- `pnpm --filter @basketeasy/server exec prisma migrate dev` (or the repo's standard migration command) to apply the new migration locally against the dev DB.
- `pnpm format:check` and per-package lint.
- Manual/dev-server pass: register a new account → log in → visit `/account`, set first/last name + an avatar URL → save → confirm `AppHeader`/session reflect it (no visible avatar rendering is in scope this pass, just persistence) → go to a club roster, add a player, pick that account as "Compte lié" → confirm name fields auto-populate → submit → player created with that name.
