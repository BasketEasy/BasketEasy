import type { AuthUser, RefreshResponse } from '@basketeasy/types/auth';
import { apiClient, setAccessToken } from '../api/client';

// Module-level singleton so React.StrictMode's dev-mode double-invoke of
// AuthProvider's mount effect (mount → cleanup → mount) doesn't fire the
// session-restore network calls twice. Both effect invocations await the
// SAME promise, so /auth/refresh is only ever called once per page load —
// which matters because the refresh token is single-use/rotating, so a
// second concurrent call would always fail with 401 and discard a valid
// session. Deliberately never reset back to null (unlike client.ts's own
// `refreshPromise`, which resets per-call to serve future 401s): this
// assumes AuthProvider mounts once per page load, which holds today since
// it wraps the whole app once in main.tsx with no routing. If a future
// routing change ever unmounts/remounts AuthProvider mid-session, this
// singleton would need to be reset (e.g. on unmount) or reconsidered.
let sessionRestorePromise: Promise<AuthUser | null> | null = null;

export function restoreSessionOnce(): Promise<AuthUser | null> {
  if (!sessionRestorePromise) {
    sessionRestorePromise = (async () => {
      try {
        const refreshResponse = await apiClient.post<RefreshResponse>('/auth/refresh');
        setAccessToken(refreshResponse.accessToken);
        return await apiClient.get<AuthUser>('/auth/me');
      } catch {
        // No valid session to restore — this is the normal state for a
        // first-time visitor, not an error to surface.
        return null;
      }
    })();
  }
  return sessionRestorePromise;
}

// Test-only escape hatch: resets the module-level session-restore singleton
// between test cases, since each test needs a fresh AuthProvider mount to
// actually hit its own MSW handlers instead of reusing the previous test's
// cached restore result. Not used by production code.
export function __resetSessionRestoreForTests(): void {
  sessionRestorePromise = null;
}
