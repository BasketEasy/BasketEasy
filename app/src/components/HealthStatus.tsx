import { useQuery } from '@tanstack/react-query';
import type { HealthCheckResponse } from '@basketeasy/types/health';
import { Card, CardHeader, CardTitle, CardContent } from '@basketeasy/ui/card';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
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
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Statut de l&apos;API</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending && <p className="text-muted">Vérification de /api/health…</p>}

        {data && (
          <p>
            <span className="font-semibold text-green-700">● {data.status}</span>
            {Object.entries(data.details).map(([key, detail]) => (
              <span key={key}>
                {' — '}
                {key}: {detail.status}
              </span>
            ))}
          </p>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              <strong>● injoignable</strong>
              {' — '}
              {error instanceof ApiError ? error.message : 'Erreur inconnue'}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
