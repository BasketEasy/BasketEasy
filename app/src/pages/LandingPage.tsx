import type { ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Button, type ButtonProps } from '@basketeasy/ui/button';
import { Card, CardContent } from '@basketeasy/ui/card';
import { Badge } from '@basketeasy/ui/badge';
import { Heading } from '@basketeasy/ui/heading';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { DeviceFrame } from '@basketeasy/ui/device-frame';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import { cn } from '@basketeasy/ui/cn';
import { focusRing } from '@basketeasy/ui/focus-ring';
import { Check } from '@basketeasy/ui/icons/check';
import { BuildingIcon } from '@basketeasy/ui/icons/building';
import { ShieldIcon } from '@basketeasy/ui/icons/shield';
import { UsersIcon } from '@basketeasy/ui/icons/users';
import { BasketballIcon } from '@basketeasy/ui/icons/basketball';
import { PublicHeader, type PublicHeaderAnchor } from '../components/PublicHeader';
import { useAccount } from '../auth/useAccount';
// Real screenshots of the app, captured from fixtures (fictional club, no
// real person) by scripts/capture-landing-screenshots.mjs --assets. Re-run it
// when one of these screens changes.
import heroManagerHome from '../assets/landing/hero-manager-home.webp';
import heroPlayerHome from '../assets/landing/hero-player-home.webp';
import coachMatchDesktop from '../assets/landing/coach-match-desktop.webp';
import coachMatchPhone from '../assets/landing/coach-match-phone.webp';
import guestRsvpPhone from '../assets/landing/guest-rsvp-phone.webp';
import matchRdvPhone from '../assets/landing/match-rdv-phone.webp';
import jerseyDutyPhone from '../assets/landing/jersey-duty-phone.webp';
import seasonStatsDesktop from '../assets/landing/season-stats-desktop.webp';
import seasonStatsPhone from '../assets/landing/season-stats-phone.webp';

// Copy comes verbatim from the validated canvas
// (https://claude.ai/artifact/Wyx7QNTdD5AoFDq7prcHz5); the headline is
// docs/brand.md's. Everything shown here ships today: no price, testimonial
// or figure is claimed that the product or the team can't back.

/** Intrinsic sizes of the stored screenshots (the capture script's widths). */
const PHONE_SHOT = { width: 600, height: 1155 } as const;
const DESKTOP_SHOT = { width: 1280, height: 800 } as const;

const REGISTER_CTA = 'Créer mon équipe gratuitement';

const ANCHORS: readonly PublicHeaderAnchor[] = [
  { href: '#semaine', label: 'Fonctionnalités' },
  { href: '#etapes', label: 'Comment ça marche' },
  { href: '#faq', label: 'Questions' },
];

const PAINS = [
  {
    quote: '« Qui vient samedi ? »',
    detail: 'Relancer un par un dans le groupe WhatsApp, puis recompter les pouces à la main.',
  },
  {
    quote: '« On se retrouve où, à quelle heure ? »',
    detail:
      'L’adresse du gymnase adverse, l’heure du départ, qui conduit : redemandé à chaque match.',
  },
  {
    quote: '« Qui lave les maillots ? »',
    detail: 'Toujours la même famille qui repart avec le sac, semaine après semaine.',
  },
];

const AUDIENCES = [
  {
    eyebrow: 'Coachs et dirigeants',
    title: 'Ce qui reste à faire, en haut de l’écran.',
    detail:
      'Match sans convocation, réponses en attente, feuille de marque à valider : l’accueil liste ce qui vous attend.',
  },
  {
    eyebrow: 'Joueurs',
    title: 'Convoqué ? Où ? À quelle heure ?',
    detail: '« Ma semaine » répond en ouvrant l’app, et on répond depuis le même écran.',
  },
  {
    eyebrow: 'Parents',
    title: 'Répondre pour son enfant.',
    detail:
      'Un parent suit les convocations de son enfant, répond pour lui et choisit le trajet, sans compte partagé.',
  },
  {
    eyebrow: 'CTC et ententes',
    title: 'Une équipe, plusieurs clubs.',
    detail: 'Effectif, agenda et encadrants partagés entre clubs, sans rien ressaisir.',
  },
];

const STEPS = [
  { title: 'Créez votre équipe', detail: 'Un compte, un club, une équipe. Gratuit.' },
  { title: 'Ajoutez l’effectif', detail: 'Un par un ou en important votre liste existante.' },
  {
    title: 'Partagez le lien',
    detail: 'Collez-le dans le groupe WhatsApp : les réponses arrivent.',
  },
];

const FAQ = [
  {
    question: 'C’est vraiment gratuit ?',
    answer:
      'Oui : créer votre club, votre équipe et inviter vos joueurs ne coûte rien, sans carte bancaire.',
  },
  {
    question: 'Mes joueurs doivent-ils tous créer un compte ?',
    answer:
      'Non. Le lien d’équipe permet de répondre sans compte. Ceux qui veulent les notifications, le trajet ou les stats créent un compte quand ils le souhaitent.',
  },
  {
    question: 'Où sont stockées les données ?',
    answer:
      'En France, dans le respect du RGPD. Pour un joueur mineur, l’autorisation parentale est demandée et les parents peuvent répondre pour leur enfant.',
  },
  {
    question: 'Mon équipe réunit plusieurs clubs. Ça marche ?',
    answer:
      'Oui, c’est même pour ça que Kluvo existe : une équipe peut être rattachée à plusieurs clubs, chacun garde ses accès.',
  },
  {
    question: 'Est-ce que ça remplace les outils de la fédération ?',
    answer:
      'Non. Les licences et la feuille de marque officielle restent où elles sont : Kluvo s’occupe de tout ce qui se passe autour, dans la semaine de l’équipe.',
  },
];

function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 md:px-8', className)}>{children}</div>;
}

function CheckLine({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check size="lg" tone="structure" className="mt-0.5 shrink-0" aria-hidden="true" />
      <Text as="span">{children}</Text>
    </li>
  );
}

/**
 * The page's one call to action. A signed-in visitor can read the pitch too
 * (kluvo.net is the brand's front door, not only a sign-up form), so for them
 * it leads back into the app rather than to a register form they'd bounce off.
 */
function RegisterButton({ variant }: { variant?: ButtonProps['variant'] }) {
  const { user } = useAccount();
  return (
    <Button asChild size="lg" variant={variant}>
      {user ? (
        <Link to={homePath(user)}>Aller à mon espace</Link>
      ) : (
        <Link to="/register">{REGISTER_CTA}</Link>
      )}
    </Button>
  );
}

/** Where PublicOnlyRoute sends a signed-in user: the profile first while it has no name. */
function homePath(user: { firstName: string | null }): string {
  return user.firstName ? '/dashboard' : '/account';
}

/**
 * One day of the week story: the text, and the screenshot that proves it.
 * `reverse` puts the screenshot on the left from `md`; on a phone the text
 * always comes first.
 */
function WeekDay({
  eyebrow,
  title,
  body,
  checks,
  reverse = false,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  checks: string[];
  reverse?: boolean;
  children: ReactNode;
}) {
  return (
    <article
      className={cn(
        'flex flex-col gap-8 md:items-center md:gap-14',
        reverse ? 'md:flex-row-reverse' : 'md:flex-row',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Text variant="eyebrow" size="sm" tone="brand">
          {eyebrow}
        </Text>
        <Heading as="h3" size="feature">
          {title}
        </Heading>
        <Text variant="meta" size="lg">
          {body}
        </Text>
        <ul className="flex flex-col gap-2">
          {checks.map((check) => (
            <CheckLine key={check}>{check}</CheckLine>
          ))}
        </ul>
      </div>
      <div className="flex min-w-0 flex-1 items-end justify-center gap-6">{children}</div>
    </article>
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

  // In a browser the page is for everyone, signed in or not: its calls to
  // action switch to « Aller à mon espace ». An installed app is not a place
  // for the pitch (its start_url is /dashboard; this covers a stray « / »):
  // it goes straight into the app, or to the sign-in form without a session.
  if (!isLoading && isStandalone()) {
    return <Navigate to={user ? homePath(user) : '/login'} replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-ground text-charcoal">
      <PublicHeader anchors={ANCHORS} ctaOnMobile={false} />

      <main className="flex-1">
        {/* Hero */}
        <section className="py-8 md:py-16">
          <Container className="flex flex-col gap-10 md:flex-row md:items-center md:gap-14">
            <div className="flex min-w-0 flex-1 flex-col gap-5 md:gap-6">
              <Badge tone="structure" size="md" className="w-fit gap-1.5">
                <BuildingIcon size="md" aria-hidden="true" />
                Pensé pour les CTC et les ententes
              </Badge>
              <Heading as="h1" size="display">
                Moins de tableurs,{' '}
                <Text as="span" size="inherit" tone="brand" className="md:block">
                  plus de terrain.
                </Text>
              </Heading>
              <Text variant="meta" size="xl" className="max-w-xl">
                Convocations, réponses, rendez-vous du samedi et stats de la saison : toute la
                semaine de votre équipe dans une seule app. Pensé pour les bénévoles, pas pour les
                DSI.
              </Text>
              <div className="flex flex-col gap-3 md:flex-row">
                <RegisterButton />
                <Button asChild size="lg" variant="outline" className="hidden md:inline-flex">
                  <a href="#semaine">Voir une semaine type</a>
                </Button>
              </div>
              <ul className="flex flex-col gap-2">
                <CheckLine>Gratuit pour démarrer, sans carte bancaire</CheckLine>
                <CheckLine>
                  Vos joueurs répondent{' '}
                  <Text as="strong" variant="label" size="inherit">
                    sans installer l’app
                  </Text>
                  , depuis le groupe WhatsApp
                </CheckLine>
                <CheckLine>Données hébergées en France, conformes RGPD</CheckLine>
              </ul>
            </div>
            <div className="relative flex min-w-0 flex-1 justify-center md:block md:pb-10">
              <DeviceFrame
                variant="browser"
                url="kluvo.fr/dashboard"
                src={heroManagerHome}
                {...DESKTOP_SHOT}
                alt="Accueil d’une coach dans Kluvo : la liste « À traiter » (match sans convocation, réponse en attente, feuille de marque à valider) à côté des matchs et entraînements de la semaine."
                priority
                className="hidden md:block md:w-5/6"
              />
              <DeviceFrame
                variant="phone"
                src={heroPlayerHome}
                {...PHONE_SHOT}
                alt="« Ma semaine » d’une joueuse sur téléphone : sa convocation pour le match de samedi, avec les boutons Oui, Peut-être et Non pour répondre en un geste."
                priority
                className="w-64 md:absolute md:bottom-0 md:right-0 md:w-1/3"
              />
            </div>
          </Container>
        </section>

        {/* Trust strip */}
        <section aria-label="Garanties" className="border-y border-border bg-surface-2">
          <Container className="grid grid-cols-2 gap-x-3 gap-y-4 py-5 md:grid-cols-4 md:gap-6 md:py-6">
            {[
              {
                icon: ShieldIcon,
                title: 'Hébergé en France',
                detail: 'RGPD, données des mineurs protégées',
              },
              {
                icon: BuildingIcon,
                title: 'Une équipe, plusieurs clubs',
                detail: 'CTC et ententes gérées nativement',
              },
              {
                icon: UsersIcon,
                title: 'Les parents aussi',
                detail: 'Ils répondent pour leur enfant',
              },
              {
                icon: BasketballIcon,
                title: 'Fait pour le basket',
                detail: 'Pas un outil multisport générique',
              },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-2">
                <item.icon size="lg" tone="structure" className="shrink-0" aria-hidden="true" />
                <div>
                  <Text variant="label" size="sm">
                    {item.title}
                  </Text>
                  <Text variant="meta" className="hidden md:block">
                    {item.detail}
                  </Text>
                </div>
              </div>
            ))}
          </Container>
        </section>

        {/* The week the visitor already lives */}
        <section className="pb-3 pt-11 md:pb-6 md:pt-20">
          <Container className="flex flex-col gap-6 md:gap-8">
            <div className="flex max-w-3xl flex-col gap-3">
              <Text variant="eyebrow" size="sm" tone="brand">
                Jeudi soir, 22 h
              </Text>
              <Heading as="h2" size="section">
                Vous reconnaissez cette semaine ?
              </Heading>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
              {PAINS.map((pain) => (
                <Card key={pain.quote}>
                  <CardContent className="flex flex-col gap-2.5">
                    <Text variant="label" size="xl">
                      {pain.quote}
                    </Text>
                    <Text variant="meta" size="md">
                      {pain.detail}
                    </Text>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Text variant="label" size="xl">
              Kluvo range tout ça dans la semaine de votre équipe. Voici à quoi elle ressemble.
            </Text>
          </Container>
        </section>

        {/* One week with Kluvo, each day proven by a real screen */}
        <section id="semaine" className="scroll-mt-16 pb-12 pt-10 md:pb-20 md:pt-14">
          <Container className="flex flex-col gap-14 md:gap-24">
            <SectionHeading as="h2">Une semaine avec Kluvo</SectionHeading>

            <WeekDay
              eyebrow="Mardi · Convoquer"
              title="Le groupe du samedi, fait en deux clics."
              body="Choisissez qui est convoqué : chacun est prévenu par notification et par e-mail, et répond Présent, Absent ou Incertain."
              checks={[
                '« Qui n’a pas répondu ? » visible d’un coup d’œil',
                'Entraînements récurrents créés une fois pour la saison',
              ]}
            >
              <DeviceFrame
                variant="browser"
                url="kluvo.fr/…/events/match"
                src={coachMatchDesktop}
                {...DESKTOP_SHOT}
                alt="Page d’un match côté coach : 10 joueuses convoquées, 1 sans réponse, la barre des réponses et le tableau des présences avec le mode de déplacement de chacune."
                className="hidden w-full md:block"
              />
              <DeviceFrame
                variant="phone"
                src={coachMatchPhone}
                {...PHONE_SHOT}
                alt="Page d’un match côté coach sur téléphone : 10 convoquées, 1 sans réponse, 7 oui, 1 peut-être, 1 non, et le bouton « Modifier la convocation »."
                className="w-60 md:hidden"
              />
            </WeekDay>

            <WeekDay
              reverse
              eyebrow="Mercredi · Partager"
              title="Vos joueurs répondent sans créer de compte."
              body="Un seul lien d’équipe à coller dans votre groupe WhatsApp. Chacun clique, trouve son nom, répond. Kluvo prépare même le message : vous n’avez qu’à l’envoyer."
              checks={[
                'Pas d’application à installer pour démarrer',
                'Rappel au bon moment pour repartager le lien',
              ]}
            >
              <DeviceFrame
                variant="phone"
                src={guestRsvpPhone}
                {...PHONE_SHOT}
                alt="Le lien d’équipe ouvert depuis WhatsApp, sans compte : « Vous répondez pour Jade L. », l’entraînement de jeudi et le match de samedi avec Oui, Peut-être, Non."
                className="w-60 md:w-64"
              />
            </WeekDay>

            <WeekDay
              eyebrow="Samedi · Jour de match"
              title="RDV, trajet et maillots : réglés avant de partir."
              body="L’heure de rendez-vous est calculée d’après le temps de trajet jusqu’au gymnase, avec l’itinéraire en un clic. Et le lavage des maillots tourne dans l’équipe : ce n’est plus toujours la même personne."
              checks={[
                'Chacun choisit : point de RDV ou direct à la salle',
                'Prévenu automatiquement si l’heure ou la salle change',
              ]}
            >
              <DeviceFrame
                variant="phone"
                src={matchRdvPhone}
                {...PHONE_SHOT}
                alt="Page du match côté joueuse : RDV à 19:15 au parking du gymnase avec 22 min de trajet, arrivée à 19:45, coup d’envoi à 20:30."
                className="w-60"
              />
              <DeviceFrame
                variant="phone"
                src={jerseyDutyPhone}
                {...PHONE_SHOT}
                alt="Carte « Lavage des maillots » : « C’est votre tour », 0 lavage cette saison, avec les boutons « C’est noté », « Je ne peux pas » et « Échanger »."
                className="mb-10 hidden w-52 md:block"
              />
            </WeekDay>

            <WeekDay
              reverse
              eyebrow="Dimanche · Après la rencontre"
              title="Une photo de la feuille de marque, les stats de la saison."
              body="Photographiez la feuille officielle : les points de chaque joueur sont lus automatiquement. Vous vérifiez, vous validez, la saison se remplit toute seule."
              checks={[
                'Vote du MVP du match par l’équipe',
                'Moyennes et record de la saison par joueur',
              ]}
            >
              <DeviceFrame
                variant="browser"
                url="kluvo.fr/…/teams/…?tab=stats"
                src={seasonStatsDesktop}
                {...DESKTOP_SHOT}
                alt="Statistiques de la saison d’une équipe : matchs joués, points par match, record, répartition des points par type de panier et titres de MVP de chaque joueuse."
                className="hidden w-full md:block"
              />
              <DeviceFrame
                variant="phone"
                src={seasonStatsPhone}
                {...PHONE_SHOT}
                alt="Statistiques de la saison sur téléphone : la fiche d’une joueuse avec 4 matchs, 15,3 points par match, la répartition de ses 61 points et 2 titres de MVP."
                className="w-60 md:hidden"
              />
            </WeekDay>

            <div className="flex flex-col md:items-center">
              <RegisterButton />
            </div>
          </Container>
        </section>

        {/* For the whole club */}
        <section className="border-y border-border bg-surface-2 py-10 md:py-20">
          <Container className="flex flex-col gap-6 md:gap-8">
            <SectionHeading as="h2">Pour tout le club</SectionHeading>
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 md:gap-5 lg:grid-cols-4">
              {AUDIENCES.map((audience) => (
                <Card key={audience.eyebrow}>
                  <CardContent className="flex flex-col gap-2.5">
                    <Text variant="eyebrow" size="sm" tone="structure">
                      {audience.eyebrow}
                    </Text>
                    <Heading as="h3" size="2xl">
                      {audience.title}
                    </Heading>
                    <Text variant="meta" size="md">
                      {audience.detail}
                    </Text>
                  </CardContent>
                </Card>
              ))}
            </div>
          </Container>
        </section>

        {/* How it works */}
        <section id="etapes" className="scroll-mt-16 py-11 md:py-20">
          <Container className="flex flex-col gap-5 md:gap-9">
            <div className="flex flex-col gap-3">
              <Text variant="eyebrow" size="sm" tone="brand">
                Comment ça marche
              </Text>
              <Heading as="h2" size="section">
                Prêt avant le prochain entraînement.
              </Heading>
            </div>
            <ol className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-5">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <Card className="h-full">
                    <CardContent className="flex gap-3.5 md:flex-col md:gap-2.5">
                      <Text
                        as="span"
                        variant="display"
                        size="5xl"
                        tone="brand"
                        className="tabular leading-none"
                        aria-hidden="true"
                      >
                        {index + 1}
                      </Text>
                      <div className="flex flex-col gap-1.5 md:gap-2.5">
                        <Heading as="h3" size="2xl">
                          {step.title}
                        </Heading>
                        <Text variant="meta" size="md">
                          {step.detail}
                        </Text>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
            <div className="flex flex-col md:flex-row">
              <RegisterButton />
            </div>
          </Container>
        </section>

        {/* Objections */}
        <section id="faq" className="scroll-mt-16 pb-11 md:pb-20">
          <Container className="flex flex-col">
            <SectionHeading as="h2" className="mb-2 md:mb-3">
              Vos questions
            </SectionHeading>
            {FAQ.map((item, index) => (
              <details
                key={item.question}
                open={index === 0}
                className="group border-b border-border py-4 md:py-5"
              >
                <summary
                  className={cn(
                    'flex cursor-pointer items-start justify-between gap-4 rounded-sm',
                    focusRing,
                  )}
                >
                  <Text as="span" variant="label" size="lg">
                    {item.question}
                  </Text>
                  <Text
                    as="span"
                    variant="display"
                    size="2xl"
                    tone="structure"
                    className="leading-none transition-transform group-open:rotate-45"
                    aria-hidden="true"
                  >
                    +
                  </Text>
                </summary>
                <Text variant="meta" size="md" className="mt-2.5 max-w-3xl">
                  {item.answer}
                </Text>
              </details>
            ))}
          </Container>
        </section>

        {/* Final call to action */}
        <section className="bg-blue-green py-11 md:py-16">
          <Container className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-8">
            <div className="flex min-w-0 flex-col gap-3">
              <Heading as="h2" size="section" tone="inverse">
                Samedi prochain, sachez qui vient dès lundi.
              </Heading>
              <Text tone="inverseSecondary" size="lg">
                Créez votre équipe maintenant, partagez le lien ce soir.
              </Text>
            </div>
            <div className="flex shrink-0 flex-col">
              <RegisterButton variant="inverseFilled" />
            </div>
          </Container>
        </section>
      </main>

      {/* pb-28 below md: room for the pinned call-to-action bar. */}
      <footer className={cn('border-t border-border pt-6 md:py-8', user ? 'pb-6' : 'pb-28')}>
        <Container className="flex flex-col gap-3 md:flex-row-reverse md:items-center md:justify-between">
          <nav aria-label="Documents légaux" className="flex flex-wrap gap-x-4 gap-y-2 md:gap-x-5">
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
          <Text variant="meta">© Kluvo · Données hébergées en France · RGPD</Text>
        </Container>
      </footer>

      {/* Phones only: the one call to action never scrolls out of reach. A
          signed-in visitor already has « Mon espace » in the header. */}
      {!user && (
        <div className="safe-area-bottom fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface shadow-bar-up md:hidden">
          <div className="flex flex-col px-4 py-3">
            <RegisterButton />
          </div>
        </div>
      )}
    </div>
  );
}
