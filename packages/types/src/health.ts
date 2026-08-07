export interface HealthResponse {
  status: 'ok' | 'error';
  service: string;
  timestamp: string;
}
