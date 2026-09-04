import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@basketeasy/ui/card';
import { PageContainer } from '@basketeasy/ui/page-container';
import { RadioCardGroup } from '@basketeasy/ui/radio-card-group';
import { Text } from '@basketeasy/ui/text';
import { AccountProfileForm } from '../account/AccountProfileForm';
import { useActiveClub } from '../auth/useActiveClub';
import { useLogout } from '../auth/mutations';
import { useAdminClubs } from '../clubs/useAdminClubs';
import { useShowCreateClub } from '../clubs/useShowCreateClub';
import { NotificationPreferencesCard } from '../notifications/NotificationPreferencesCard';

/**
 * The profile page is also where the top bar's mobile-only job lives now:
 * with `AppHeader` rendering nothing below the desktop breakpoint, the club
 * switcher, "Créer un club" and logout have no other home on a phone — see
 * `AppHeader`'s own doc comment. All three still render on desktop too,
 * where they exist a second time in the header's `AccountMenu` — cheap
 * duplication, and it keeps this page self-contained rather than branching
 * on viewport width.
 */
export function AccountPage() {
  const adminClubs = useAdminClubs();
  const { activeClubId, setActiveClubId } = useActiveClub();
  const showCreateClub = useShowCreateClub();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();

  return (
    <PageContainer size="md">
      <Card>
        <CardHeader>
          <CardTitle>Mon compte</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountProfileForm />
        </CardContent>
      </Card>

      <NotificationPreferencesCard />

      {adminClubs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Club actif</CardTitle>
          </CardHeader>
          <CardContent>
            <Text variant="meta" className="mb-3">
              Le club dont vous gérez l'effectif depuis la barre du bas.
            </Text>
            <RadioCardGroup
              aria-label="Club actif"
              value={activeClubId}
              onChange={setActiveClubId}
              options={adminClubs.map((club) => ({
                value: club.id,
                render: ({ selected }) => (
                  <Text as="span" variant="label" tone={selected ? 'primary' : 'secondary'}>
                    {club.name}
                  </Text>
                ),
              }))}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2">
          {showCreateClub && (
            <Button asChild variant="outline">
              <Link to="/clubs/new">Créer un club</Link>
            </Button>
          )}
          <Button variant="outline" disabled={isLoggingOut} onClick={() => logout()}>
            Se déconnecter
          </Button>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
