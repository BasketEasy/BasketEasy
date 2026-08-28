import { useQuery } from '@tanstack/react-query';
import type { HealthCheckResponse } from '@basketeasy/types/health';
import { Card, CardHeader, CardTitle, CardContent } from '@basketeasy/ui/card';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { apiClient, ApiError } from '../api/client';
import { Text } from '@basketeasy/ui/text';

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
        {isPending && <Text variant="meta">Vérification de /api/health…</Text>}

        {data && (
          <p>
            <Text as="span" variant="label" tone="success">
              ● {data.status}
            </Text>
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
