// Shared between auth.service.ts (the refresh_token DB row's expiresAt) and
// auth.controller.ts (the refresh_token cookie's maxAge) so the two can
// never silently drift apart — see the review discussion on PR #19 for why
// that matters (a cookie that outlives or dies before its DB row is a
// confusing, hard-to-reproduce bug).
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// OAuth 2.0 refresh token rotation's standard "reuse grace period" (see e.g.
// Auth0's rotation docs, and the reuse-detection guidance in the OAuth 2.0
// Security Best Current Practice draft): a rotated-away token presented
// again shortly after its own rotation is far more likely to be a race
// between two legitimate concurrent requests from the same client — two
// browser tabs, or a tab plus an installed PWA, both restoring a session at
// once — than actual token theft, since a thief replaying a stolen token
// would have no reason to do so within seconds of the legitimate rotation.
// AuthService.refresh() honours this by issuing a fresh pair instead of
// revoking the family when the reuse falls inside this window; outside it,
// reuse is still treated as theft.
export const REFRESH_REUSE_GRACE_MS = 30 * 1000;
