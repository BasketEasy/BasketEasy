import { useNavigate } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@basketeasy/ui/card';
import { Badge } from '@basketeasy/ui/badge';
import { useAccount } from '../auth/useAccount';

// Copy sourced from docs/brand.md (headline/subhead/footer) and
// docs/feature-set.md (P0/P1 highlights) — see CLAUDE.md's "What BasketEasy
// is" for why these are the ones called out first.
const FEATURES: { title: string; description: string; badge?: string }[] = [
  {
    title: 'Calendrier & convocations',
    description:
      "Un agenda partagé pour l'équipe, des convocations envoyées en un clic et un suivi des réponses en temps réel.",
  },
  {
    title: 'Paiement à la HelloAsso',
    description:
      'Collecte des cotisations sans frais cachés, adaptée aux habitudes de paiement des clubs amateurs français.',
  },
  {
    title: 'Hébergement France · RGPD',
    description:
      'Toutes les données, y compris celles des mineurs, restent hébergées en France et conformes au RGPD par défaut.',
  },
  {
    title: 'Équipes multi-clubs (CTC)',
    description:
      'Gérez nativement les ententes entre plusieurs clubs : effectifs, encadrants et droits partagés sur une même équipe.',
    badge: 'Bientôt',
  },
  {
    title: 'Créneaux & conflits',
    description:
      'Visibilité sur les créneaux de gymnase utilisés par vos équipes, avec alerte automatique en cas de chevauchement.',
    badge: 'Bientôt',
  },
  {
    title: 'Feuille de marque par IA',
    description:
      'Photographiez la feuille de marque officielle en fin de match : les statistiques et le temps de jeu sont extraits automatiquement.',
    badge: 'Bientôt',
  },
];

const POSITIONING = [
  {
    title: 'Un complément, pas un remplacement',
    description:
      "BasketEasy vient en appui de la FBI et d'e-Marque V2, la pile officielle de la FFBB — pas à leur place.",
  },
  {
    title: 'Pensé pour les CTC',
    description:
      'En Loire-Atlantique, une équipe rassemble souvent plusieurs clubs. BasketEasy modélise ça nativement.',
  },
  {
    title: 'Fait pour les bénévoles',
    description:
      'Une interface simple pour les présidents, trésoriers et coachs bénévoles — pas pour des services informatiques.',
  },
];

export function LandingPage() {
  const navigate = useNavigate();
  const { user, isLoading } = useAccount();

  return (
    <div className="flex min-h-screen flex-col bg-cream text-charcoal">
      <header className="border-b border-border">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="font-heading text-2xl font-extrabold text-orange">BasketEasy</span>
          <div className="flex items-center gap-3">
            {!isLoading &&
              (user ? (
                <Button onClick={() => navigate('/dashboard')}>Mon espace</Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => navigate('/login')}>
                    Se connecter
                  </Button>
                  <Button onClick={() => navigate('/register')}>Créer un compte</Button>
                </>
              ))}
          </div>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center">
          <Badge variant="outline">Loire-Atlantique · CD44</Badge>
          <h1 className="text-5xl">Moins de tableurs, plus de terrain.</h1>
          <p className="max-w-xl text-lg text-muted">
            BasketEasy centralise calendriers, créneaux et feuilles de marque pour les clubs de
            basket amateurs de Loire-Atlantique. Pensé pour les bénévoles, pas pour les DSI.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {!isLoading && user ? (
              <Button size="lg" onClick={() => navigate('/dashboard')}>
                Aller à mon espace
              </Button>
            ) : (
              <>
                <Button size="lg" onClick={() => navigate('/register')}>
                  Créer un compte gratuitement
                </Button>
                <Button size="lg" variant="outline" onClick={() => navigate('/login')}>
                  Se connecter
                </Button>
              </>
            )}
          </div>
        </section>

        <section className="border-y border-border bg-white">
          <div className="mx-auto grid max-w-5xl gap-8 px-6 py-16 md:grid-cols-3">
            {POSITIONING.map((item) => (
              <div key={item.title} className="flex flex-col gap-2">
                <h2 className="text-xl">{item.title}</h2>
                <p className="text-sm text-muted">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="mb-8 text-center text-3xl">Ce que BasketEasy simplifie pour votre club</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle>{feature.title}</CardTitle>
                    {feature.badge && <Badge variant="secondary">{feature.badge}</Badge>}
                  </div>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-6 py-8 text-center text-sm text-muted">
        Données hébergées en France · RGPD
      </footer>
    </div>
  );
}
