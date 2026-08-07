import { useQuery } from '@tanstack/react-query';
import type { HealthCheckResponse } from '@basketeasy/types/health';
import { apiClient, ApiError } from '../api/client';

/**
 * Calls GET /api/health and renders the backend's status, including the
 * Prisma-backed database indicator. This is the "does the frontend talk to
 * the backend, and does the backend talk to the DB" smoke test for the
 * scaffold.
 */
export function HealthStatus() {
  const { data, error, isPending } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.get<HealthCheckResponse>('/health'),
  });

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

      {isPending && <p>Checking /api/health…</p>}

      {data && (
        <p>
          <span style={{ color: '#2E7D32', fontWeight: 600 }}>● {data.status}</span>
          {Object.entries(data.details).map(([key, detail]) => (
            <span key={key}>
              {' — '}
              {key}: {detail.status}
            </span>
          ))}
        </p>
      )}

      {error && (
        <p style={{ color: '#B23A2E' }}>
          <strong>● unreachable</strong>
          {' — '}
          {error instanceof ApiError ? error.message : 'Unknown error'}
        </p>
      )}
    </div>
  );
}
