export interface MyTeamSummary {
  teamId: string;
  teamName: string;
  category: 'U9' | 'U11' | 'U13' | 'U15' | 'U18' | 'U21' | 'SENIORS';
  gender: 'MEN' | 'WOMEN';
  clubId: string;
  clubName: string;
  isTeamAdmin: boolean;
  rosterRole: 'COACH' | 'PLAYER' | null;
}
