export const SITE_URL = 'https://kluvo.net';

export const DEFAULT_TITLE = 'Kluvo — La gestion d’équipe, simplifiée.';

export interface RouteSeo {
  title: string;
  /** Indexable pages get a canonical URL; everything else is `noindex`. */
  index: boolean;
}

/**
 * The only routes a search engine should list: the landing page, the sign-up
 * page and the public legal documents. The router is client-side and both
 * hosts answer 200 with the SPA shell for any path, so an unlisted path
 * (private screens, token links, unknown URLs) must default to `noindex`.
 */
const INDEXABLE: Record<string, string> = {
  '/': DEFAULT_TITLE,
  '/register': 'Créer mon équipe gratuitement — Kluvo',
  '/mentions-legales': 'Mentions légales — Kluvo',
  '/confidentialite': 'Politique de confidentialité — Kluvo',
  '/cgu': 'Conditions générales d’utilisation — Kluvo',
};

const NOINDEX_TITLES: Record<string, string> = {
  '/login': 'Connexion — Kluvo',
  '/forgot-password': 'Mot de passe oublié — Kluvo',
  '/registre-traitements': 'Registre des traitements — Kluvo',
};

export function resolveRouteSeo(pathname: string): RouteSeo {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const indexable = INDEXABLE[path];
  if (indexable) return { title: indexable, index: true };
  return { title: NOINDEX_TITLES[path] ?? DEFAULT_TITLE, index: false };
}
