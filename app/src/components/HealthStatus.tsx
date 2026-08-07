import { useEffect, useState } from 'react';
import type { HealthResponse } from '@basketeasy/types/health';
import { apiClient, ApiError } from '../api/client';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; data: HealthResponse }
  | { kind: 'error'; message: string };

/**
 * Calls GET /api/health/ping and renders the backend's status. This is the
 * "does the frontend talk to the backend" smoke test for the scaffold —
 * domain pages (Calendar, Roster, ...) will use TanStack Query instead once
 * they land, per docs/frontend-stack.md.
 */
export function HealthStatus() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    apiClient
      .get<HealthResponse>('/health/ping')
      .then((data) => {
        if (!cancelled) setState({ kind: 'ok', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : 'Unknown error';
        setState({ kind: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid var(--be-border)',
        borderRadius: 14,
        padding: 24,
        maxWidth: 420,
      }}
    >
      <h3 style={{ margin: '0 0 12px' }}>API status</h3>

      {state.kind === 'loading' && <p>Checking /api/health…</p>}

      {state.kind === 'ok' && (
        <p>
          <span style={{ color: '#2E7D32', fontWeight: 600 }}>● {state.data.status}</span>
          {' — '}
          {state.data.service} @ {state.data.timestamp}
        </p>
      )}

      {state.kind === 'error' && (
        <p style={{ color: '#B23A2E' }}>
          <strong>● unreachable</strong> — {state.message}
        </p>
      )}
    </div>
  );
}
