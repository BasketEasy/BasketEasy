// Shared between auth.service.ts (the refresh_token DB row's expiresAt) and
// auth.controller.ts (the refresh_token cookie's maxAge) so the two can
// never silently drift apart — see the review discussion on PR #19 for why
// that matters (a cookie that outlives or dies before its DB row is a
// confusing, hard-to-reproduce bug).
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
