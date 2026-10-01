import { Link, Navigate } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@basketeasy/ui/card';
import { Badge } from '@basketeasy/ui/badge';
import { Heading } from '@basketeasy/ui/heading';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { CalendarIcon } from '@basketeasy/ui/icons/calendar';
import { UsersIcon } from '@basketeasy/ui/icons/users';
import { BuildingIcon } from '@basketeasy/ui/icons/building';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import { PublicHeader } from '../components/PublicHeader';
import { useAccount } from '../auth/useAccount';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';

// Copy sourced from docs/brand.md (headline/subhead/footer) — see
// CLAUDE.md's Events and Teams module sections for what actually ships
// today. SHIPPED carries no badge; UPCOMING keeps "Bientôt" for what's
// listed under CLAUDE.md's "What's deliberately not here yet".
const SHIPPED: { title: string; description: string; icon: typeof CalendarIcon }[] = [
  {
    title: 'Calendrier & convocations',
    description:
      'Un agenda partagé par équipe, des convocations envoyées en un clic et un suivi des réponses (présent, absent, incertain) en temps réel.',
    icon: CalendarIcon,
  },
  {
    title: 'Présences suivies',
    description:
      'Chaque joueur confirme sa présence en un clin d’œil, sans relance manuelle par SMS ou tableur.',
    icon: UsersIcon,
  },
  {
    title: 'Équipes multi-clubs (CTC)',
    description:
      'Une équipe peut réunir plusieurs clubs : effectif, encadrants et accès partagés, sans ressaisir les informations.',
    icon: BuildingIcon,
  },
];

const UPCOMING: { title: string; description: string }[] = [
  {
    title: 'Cotisations en ligne',
    description:
      'Collecte des cotisations sans frais cachés, adaptée aux habitudes de paiement des clubs amateurs français.',
  },
  {
    title: 'Créneaux & conflits',
    description:
      'Visibilité sur les créneaux de gymnase utilisés par vos équipes, avec alerte automatique en cas de chevauchement.',
  },
  {
    title: 'Feuille de marque par IA',
    description:
      'Téléversez une photo de la feuille de marque officielle en fin de match : statistiques et temps de jeu sont extraits automatiquement.',
  },
];

function HeroAgendaMock() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2 text-muted">
          <CalendarIcon size="md" aria-hidden="true" />
          <Text tone="inherit" as="span" variant="body" size="sm">
            Cette semaine · U15 Garçons
          </Text>
        </div>
      </CardHeader>
      <div className="flex flex-col gap-2 px-6 pb-6">
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 p-3">
          <div className="flex flex-col">
            <Text as="span" variant="label" size="sm">
              Entraînement
            </Text>
            <Text as="span" variant="meta">
              Mardi 19h · Gymnase Jean-Moulin
            </Text>
          </div>
          <Badge tone="structure">12 convoqués</Badge>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 p-3">
          <div className="flex flex-col">
            <Text as="span" variant="label" size="sm">
              Match vs. ES Rezé
            </Text>
            <Text as="span" variant="meta">
              Samedi 15h · Salle des sports
            </Text>
          </div>
          <Badge tone="structure">9 présents</Badge>
        </div>
      </div>
    </Card>
  );
}

function isStandalone(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  );
}

export function LandingPage() {
  const { user, isLoading } = useAccount();

  // A signed-in visitor (an installed PWA opened from its icon included) has
  // no use for the pitch: send them where PublicOnlyRoute sends /login.
  if (!isLoading && user) {
    return <Navigate to={user.firstName ? '/dashboard' : '/account'} replace />;
  }

  // An installed app opened without a session goes straight to the sign-in
  // form; the marketing page is for the browser.
  if (!isLoading && isStandalone()) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-ground text-charcoal">
      <PublicHeader />

      <main className="flex-1">
        <section className="mx-auto grid max-w-5xl gap-10 px-6 py-16 md:grid-cols-2 md:items-center md:py-24">
          <div className="flex flex-col items-center gap-6 text-center md:items-start md:text-left">
            <Badge tone="structure" className="w-fit">
              Pensé pour les CTC
            </Badge>
            <Heading as="h1" size="6xl">
              Moins de tableurs, plus de terrain.
            </Heading>
            <Text variant="meta" size="lg" className="max-w-xl">
              Kluvo centralise calendriers, convocations et présences pour les clubs de basket
              amateurs — y compris quand une équipe réunit plusieurs clubs. Pensé pour les
              bénévoles, pas pour les DSI.
            </Text>
            <div className="flex flex-wrap justify-center gap-3 md:justify-start">
              <Button asChild size="lg">
                <Link to="/register">Créer un compte gratuitement</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/login">Se connecter</Link>
              </Button>
            </div>
          </div>
          <div className="flex justify-center md:justify-end">
            <HeroAgendaMock />
          </div>
        </section>

        <section className="border-y border-border bg-surface-2">
          <div className="mx-auto max-w-5xl px-6 py-12">
            <SectionHeading as="h2" className="mb-6">
              Le marché visé
            </SectionHeading>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="flex items-center gap-3">
                <BuildingIcon size="xl" tone="structure" className="shrink-0" aria-hidden="true" />
                <Text variant="meta">
                  <Text as="span" variant="display" size="2xl" className="tabular">
                    ~130
                  </Text>{' '}
                  clubs affiliés en Loire-Atlantique (CD44), premier marché visé.
                </Text>
              </div>
              <div className="flex items-center gap-3">
                <UsersIcon size="xl" tone="structure" className="shrink-0" aria-hidden="true" />
                <Text variant="meta">
                  <Text as="span" variant="display" size="2xl" className="tabular">
                    ~28 000
                  </Text>{' '}
                  licenciés dans ce même département.
                </Text>
              </div>
              <div className="flex items-center gap-3">
                <TrophyIcon size="xl" tone="structure" className="shrink-0" aria-hidden="true" />
                <Text variant="meta">
                  <Text as="span" variant="display" size="2xl" className="tabular">
                    0 €
                  </Text>{' '}
                  pour créer votre club et inviter votre première équipe.
                </Text>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-16">
          <SectionHeading as="h2" className="mb-8">
            Ce qui fonctionne aujourd&apos;hui
          </SectionHeading>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {SHIPPED.map((feature) => (
              <article key={feature.title}>
                <Card>
                  <CardHeader>
                    <feature.icon size="xl" tone="structure" aria-hidden="true" />
                    <CardTitle>{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-16">
          <div className="rounded-lg border border-dashed border-border-strong p-6 md:p-8">
            <SectionHeading as="h2" className="mb-8">
              La suite
            </SectionHeading>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {UPCOMING.map((feature) => (
                <article key={feature.title}>
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle>{feature.title}</CardTitle>
                        <Badge tone="structure">Bientôt</Badge>
                      </div>
                      <CardDescription>{feature.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-blue-green text-cream">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-6 py-16 text-center md:flex-row md:items-center md:justify-between md:text-left">
            <div className="flex flex-col items-center gap-4 text-center md:items-start md:text-left">
              <Heading as="h2" size="3xl" tone="inverse">
                Prêt à simplifier la gestion de votre équipe ?
              </Heading>
              <Text tone="inverseSecondary" className="max-w-xl">
                Créez un compte gratuitement et invitez votre équipe en quelques minutes.
              </Text>
            </div>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="bg-surface text-blue-green hover:bg-sunk"
            >
              <Link to={!isLoading && user ? '/dashboard' : '/register'}>
                {!isLoading && user ? 'Aller à mon espace' : 'Créer un compte gratuitement'}
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="flex flex-col items-center gap-3 border-t border-border px-6 py-8 text-center">
        <nav
          aria-label="Documents légaux"
          className="flex flex-wrap justify-center gap-x-4 gap-y-2"
        >
          <TextLink asChild size="sm">
            <Link to="/mentions-legales">Mentions légales</Link>
          </TextLink>
          <TextLink asChild size="sm">
            <Link to="/confidentialite">Confidentialité</Link>
          </TextLink>
          <TextLink asChild size="sm">
            <Link to="/cgu">CGU</Link>
          </TextLink>
          <TextLink asChild size="sm">
            <Link to="/registre-traitements">Registre des traitements</Link>
          </TextLink>
        </nav>
        <Text variant="meta">© Kluvo 2025–{new Date().getFullYear()} · Tous droits réservés</Text>
      </footer>
    </div>
  );
}
