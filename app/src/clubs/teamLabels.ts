import type { TeamCategory, TeamGender, TeamMemberRole } from '@basketeasy/types/teams';

export const TEAM_CATEGORY_OPTIONS: { value: TeamCategory; label: string }[] = [
  { value: 'U9', label: 'U9' },
  { value: 'U11', label: 'U11' },
  { value: 'U13', label: 'U13' },
  { value: 'U15', label: 'U15' },
  { value: 'U18', label: 'U18' },
  { value: 'U21', label: 'U21' },
  { value: 'SENIORS', label: 'Séniors' },
];

export const TEAM_GENDER_OPTIONS: { value: TeamGender; label: string }[] = [
  { value: 'MEN', label: 'Masculin' },
  { value: 'WOMEN', label: 'Féminin' },
];

const categoryLabels = new Map(TEAM_CATEGORY_OPTIONS.map((o) => [o.value, o.label]));
const genderLabels = new Map(TEAM_GENDER_OPTIONS.map((o) => [o.value, o.label]));

export function teamCategoryLabel(category: TeamCategory): string {
  return categoryLabels.get(category) ?? category;
}

export function teamGenderLabel(gender: TeamGender): string {
  return genderLabels.get(gender) ?? gender;
}

export const TEAM_MEMBER_ROLE_OPTIONS: { value: TeamMemberRole; label: string }[] = [
  { value: 'PLAYER', label: 'Joueur' },
  { value: 'COACH', label: 'Entraîneur' },
];

const teamMemberRoleLabels = new Map(TEAM_MEMBER_ROLE_OPTIONS.map((o) => [o.value, o.label]));

export function teamMemberRoleLabel(role: TeamMemberRole): string {
  return teamMemberRoleLabels.get(role) ?? role;
}
