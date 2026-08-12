export interface FeatureCopy {
  title: string;
  description: string;
  badge?: string;
}

// Card 1 (présences) and Card 2 (calendriers/résultats) describe features
// that aren't built yet, so they keep the same "Bientôt" convention as the
// old LandingPage's FEATURES/HIGHLIGHTS. Card 3 (RGPD/hosting) and Card 4
// (built-for-volunteers positioning) are statements of current fact, not
// future features, so they aren't badged.
export const BENTO_FEATURES: FeatureCopy[] = [
  {
    title: 'Présences suivies',
    description:
      "Confirmations de présence en un clin d'œil, sans relance manuelle par SMS ou tableur — testez-le ci-dessous.",
    badge: 'Bientôt',
  },
  {
    title: 'Calendriers & résultats synchronisés',
    description:
      "Prochains entraînements, matchs et résultats au même endroit, à jour en permanence pour toute l'équipe.",
    badge: 'Bientôt',
  },
  {
    title: 'Conforme RGPD · Hébergement France',
    description:
      'Données hébergées en France · RGPD par défaut pour la protection des données des mineurs.',
  },
  {
    title: 'Pensé pour les bénévoles',
    description:
      "Zéro surcharge : un manager d'équipe met en place un jour de match en moins de 60 secondes.",
  },
];

export interface RosterPlayer {
  id: number;
  name: string;
  club: string;
  status: 'present' | 'absent';
}

export const SANDBOX_ROSTER: RosterPlayer[] = [
  { id: 1, name: 'Lucas M.', club: 'AIL de Goulaine', status: 'present' },
  { id: 2, name: 'Thomas B.', club: 'Entente Sud Basket', status: 'absent' },
  { id: 3, name: 'Antoine R.', club: 'CTC Basket 44', status: 'present' },
];
