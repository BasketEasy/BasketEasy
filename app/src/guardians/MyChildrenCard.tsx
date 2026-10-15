import { Link } from 'react-router-dom';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import type { ChildPersona } from '@basketeasy/types/guardians';

/** The body of « Mes enfants » on the account page — a link to each child's profile. */
export function MyChildrenCard({ personas }: { personas: ChildPersona[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {personas.map((child) => (
        <li key={child.playerId} className="flex flex-col">
          <TextLink asChild>
            <Link to={`/children/${child.playerId}`}>
              {child.firstName} {child.lastName}
            </Link>
          </TextLink>
          <Text variant="meta">
            {[...child.teams.map((team) => team.teamName), child.clubName].join(' · ')}
          </Text>
        </li>
      ))}
    </ul>
  );
}
