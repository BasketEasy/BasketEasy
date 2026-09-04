/**
 * Kluvo — Worker Cloudflare servant le frontend, plus un health-check
 * planifié de l'API.
 *
 * Le Worker existait jusqu'ici comme simple conteneur d'assets statiques
 * (pas de `main`). Un script est nécessaire pour porter le Cron Trigger :
 * il donne l'équivalent d'un uptime monitor externe sans sortir de
 * l'écosystème Cloudflare — le seul point du monitoring qui observe l'API
 * depuis l'extérieur de l'instance Scaleway, et donc le seul capable de
 * distinguer « l'API répond mal » de « l'instance entière est tombée ».
 *
 * Les requêtes qui correspondent à un asset ne passent jamais par ici :
 * Cloudflare les sert directement. `fetch` ne voit donc que le reste, et se
 * contente de déléguer au binding ASSETS, dont le `not_found_handling`
 * (single-page-application) renvoie index.html — exactement le comportement
 * d'avant l'ajout de ce fichier.
 */

interface AnalyticsEngineDataset {
  writeDataPoint(event: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
}

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /**
   * Optionnel à dessein : si le dataset Analytics Engine n'est pas (encore)
   * disponible sur le compte, le health-check doit continuer à tourner et à
   * logger, pas planter à chaque déclenchement du cron.
   */
  HEALTH_AE?: AnalyticsEngineDataset;
  HEALTH_CHECK_URL?: string;
}

export const DEFAULT_HEALTH_CHECK_URL = 'https://api.kluvo.net/api/health';

/** Au-delà, l'API est considérée en panne plutôt que lente. */
export const HEALTH_CHECK_TIMEOUT_MS = 10_000;

export interface HealthCheckResult {
  healthy: boolean;
  /** 0 quand la requête n'a jamais abouti (timeout, DNS, TLS). */
  httpStatus: number;
  latencyMs: number;
  /** `status` renvoyé par Terminus, ou le message d'erreur si l'appel a échoué. */
  detail: string;
}

async function readTerminusStatus(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { status?: unknown };
    return typeof body.status === 'string' ? body.status : '';
  } catch {
    // Un 502 du reverse-proxy renvoie du HTML : l'absence de JSON n'est pas
    // une erreur à propager, le code HTTP dit déjà l'essentiel.
    return '';
  }
}

export async function runHealthCheck(env: Env): Promise<HealthCheckResult> {
  const url = env.HEALTH_CHECK_URL ?? DEFAULT_HEALTH_CHECK_URL;
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
      // Le cache Cloudflare servirait une réponse d'il y a 5 minutes, ce qui
      // ferait passer une API tombée pour une API saine.
      cache: 'no-store',
    });
    const detail = await readTerminusStatus(response);

    return {
      healthy: response.ok,
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      detail,
    };
  } catch (error) {
    return {
      healthy: false,
      httpStatus: 0,
      latencyMs: Date.now() - startedAt,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export function recordHealthCheck(env: Env, result: HealthCheckResult): void {
  // `indexes` est limité à une seule valeur par point : c'est la clé
  // d'échantillonnage d'Analytics Engine, pas une étiquette libre.
  env.HEALTH_AE?.writeDataPoint({
    indexes: ['api'],
    blobs: [result.healthy ? 'up' : 'down', String(result.httpStatus), result.detail],
    doubles: [result.healthy ? 1 : 0, result.latencyMs],
  });
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: unknown, env: Env): Promise<void> {
    const result = await runHealthCheck(env);
    recordHealthCheck(env, result);

    if (!result.healthy) {
      // Visible dans les logs du Worker (wrangler tail / dashboard), en plus
      // du point Analytics Engine qui, lui, est requêtable après coup.
      console.error(
        `Health check KO: ${result.httpStatus} ${result.detail} (${result.latencyMs}ms)`,
      );
    }
  },
};
