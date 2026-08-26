import { Link } from 'react-router-dom';
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
          <CalendarIcon className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm">Cette semaine · U15 Garçons</span>
        </div>
      </CardHeader>
      <div className="flex flex-col gap-2 px-6 pb-6">
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 p-3">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-charcoal">Entraînement</span>
            <span className="text-sm text-muted">Mardi 19h · Gymnase Jean-Moulin</span>
          </div>
          <Badge variant="secondary">12 convoqués</Badge>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 p-3">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-charcoal">Match vs. ES Rezé</span>
            <span className="text-sm text-muted">Samedi 15h · Salle des sports</span>
          </div>
          <Badge variant="secondary">9 présents</Badge>
        </div>
      </div>
    </Card>
  );
}

export function LandingPage() {
  const { user, isLoading } = useAccount();

  return (
    <div className="flex min-h-screen flex-col bg-ground text-charcoal">
      <PublicHeader />

      <main className="flex-1">
        <section className="mx-auto grid max-w-5xl gap-10 px-6 py-16 md:grid-cols-2 md:items-center md:py-24">
          <div className="flex flex-col items-center gap-6 text-center md:items-start md:text-left">
            <Badge variant="secondary" className="w-fit">
              Pensé pour les CTC
            </Badge>
            <Heading as="h1" size="6xl">
              Moins de tableurs, plus de terrain.
            </Heading>
            <p className="max-w-xl text-lg text-muted">
              BasketEasy centralise calendriers, convocations et présences pour les clubs de basket
              amateurs — y compris quand une équipe réunit plusieurs clubs. Pensé pour les
              bénévoles, pas pour les DSI.
            </p>
            <div className="flex flex-wrap justify-center gap-3 md:justify-start">
              {!isLoading && user ? (
                <Button asChild size="lg">
                  <Link to="/dashboard">Aller à mon espace</Link>
                </Button>
              ) : (
                <>
                  <Button asChild size="lg">
                    <Link to="/register">Créer un compte gratuitement</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link to="/login">Se connecter</Link>
                  </Button>
                </>
              )}
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
                <BuildingIcon className="h-6 w-6 shrink-0 text-blue-green" aria-hidden="true" />
                <p className="text-sm text-muted">
                  <span className="tabular font-heading text-2xl font-bold text-charcoal">
                    ~130
                  </span>{' '}
                  clubs affiliés en Loire-Atlantique (CD44), premier marché visé.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <UsersIcon className="h-6 w-6 shrink-0 text-blue-green" aria-hidden="true" />
                <p className="text-sm text-muted">
                  <span className="tabular font-heading text-2xl font-bold text-charcoal">
                    ~28 000
                  </span>{' '}
                  licenciés dans ce même département.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <TrophyIcon className="h-6 w-6 shrink-0 text-blue-green" aria-hidden="true" />
                <p className="text-sm text-muted">
                  <span className="tabular font-heading text-2xl font-bold text-charcoal">
                    0 €
                  </span>{' '}
                  pour créer votre club et inviter votre première équipe.
                </p>
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
                    <feature.icon className="h-6 w-6 text-blue-green" aria-hidden="true" />
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
                        <Badge variant="secondary">Bientôt</Badge>
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
              <Heading as="h2" size="3xl" className="text-cream">
                Prêt à simplifier la gestion de votre équipe ?
              </Heading>
              <p className="max-w-xl text-blue-green-tint">
                Créez un compte gratuitement et invitez votre équipe en quelques minutes.
              </p>
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

      <footer className="border-t border-border px-6 py-8 text-center text-sm text-muted">
        Données hébergées en France · RGPD
      </footer>
    </div>
  );
}
