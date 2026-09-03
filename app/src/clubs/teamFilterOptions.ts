import type { TeamClubSortBy, TeamPlayerSortBy } from '@basketeasy/types/teams';
import type { SortOrder } from '@basketeasy/types/pagination';

/**
 * Sort option lists for the team page's Clubs partenaires, Effectif and
 * Événements tabs. Kept in their own module (rather than exported alongside
 * `TeamClubsTab`/`TeamRosterTab`/`TeamEventsTab`) so those component files
 * stay fast-refresh-friendly — a file mixing component and non-component
 * exports loses that.
 */

export const TEAM_CLUB_SORT_OPTIONS: {
  value: string;
  label: string;
  sortBy: TeamClubSortBy;
  sortOrder: SortOrder;
}[] = [
  { value: 'name:asc', label: 'Nom (A → Z)', sortBy: 'name', sortOrder: 'asc' },
  { value: 'name:desc', label: 'Nom (Z → A)', sortBy: 'name', sortOrder: 'desc' },
  {
    value: 'linkedAt:desc',
    label: 'Association la plus récente',
    sortBy: 'linkedAt',
    sortOrder: 'desc',
  },
  {
    value: 'linkedAt:asc',
    label: 'Association la plus ancienne',
    sortBy: 'linkedAt',
    sortOrder: 'asc',
  },
];

export const ROSTER_SORT_OPTIONS: {
  value: string;
  label: string;
  sortBy: TeamPlayerSortBy;
  sortOrder: SortOrder;
}[] = [
  { value: 'name:asc', label: 'Nom (A → Z)', sortBy: 'name', sortOrder: 'asc' },
  { value: 'name:desc', label: 'Nom (Z → A)', sortBy: 'name', sortOrder: 'desc' },
  {
    value: 'createdAt:desc',
    label: 'Ajout le plus récent',
    sortBy: 'createdAt',
    sortOrder: 'desc',
  },
  { value: 'createdAt:asc', label: 'Ajout le plus ancien', sortBy: 'createdAt', sortOrder: 'asc' },
];

export const EVENT_SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'asc', label: 'Plus proche d’abord' },
  { value: 'desc', label: 'Plus lointain d’abord' },
];
