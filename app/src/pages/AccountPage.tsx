import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Card, CardContent } from '@basketeasy/ui/card';
import { PageContainer } from '@basketeasy/ui/page-container';
import { PageHeader } from '@basketeasy/ui/page-header';
import { RadioCardGroup } from '@basketeasy/ui/radio-card-group';
import { SectionAccordion, SectionAccordionItem } from '@basketeasy/ui/section-accordion';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { Text } from '@basketeasy/ui/text';
import { AccountProfileForm } from '../account/AccountProfileForm';
import { useAccount } from '../auth/useAccount';
import { useActiveClub } from '../auth/useActiveClub';
import { useLogout } from '../auth/mutations';
import { useAdminClubs } from '../clubs/useAdminClubs';
import { useShowCreateClub } from '../clubs/useShowCreateClub';
import { NotificationPreferencesCard } from '../notifications/NotificationPreferencesCard';
import { usePersonas } from '../guardians/usePersonas';
import { MyChildrenCard } from '../guardians/MyChildrenCard';
import { ParentAccessCard } from '../guardians/ParentAccessCard';

/**
 * The profile page is also where the top bar's mobile-only job lives now:
 * with `AppHeader` shrunk to a wordmark and a bell below the desktop
 * breakpoint, the club switcher, "Créer un club" and logout have no other
 * home on a phone — see
 * `AppHeader`'s own doc comment. All three still render on desktop too,
 * where they exist a second time in the header's `AccountMenu` — cheap
 * duplication, and it keeps this page self-contained rather than branching
 * on viewport width.
 */
export function AccountPage() {
  const { user } = useAccount();
  const adminClubs = useAdminClubs();
  const { activeClubId, setActiveClubId } = useActiveClub();
  const showCreateClub = useShowCreateClub();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  // Both guardian sections are optional extras of this page: a failed or
  // pending personas read simply leaves them out rather than blocking it.
  const { data: personas } = usePersonas();
  const ownPlayerIds = personas?.self?.playerIds ?? [];
  // Every fold starts closed: the profile is the page, the rest is reference.
  const [open, setOpen] = useState<string[]>([]);

  const children = personas?.children ?? [];
  const activeClub = adminClubs.find((club) => club.id === activeClubId);

  return (
    <PageContainer size="md">
      <PageHeader
        title="Mon compte"
        meta={user ? <span className="break-all">{user.email}</span> : undefined}
      />

      <section className="flex flex-col gap-3.5">
        <SectionHeading as="h2">Profil</SectionHeading>
        <Card>
          <CardContent>
            <AccountProfileForm />
          </CardContent>
        </Card>
      </section>

      <SectionAccordion value={open} onValueChange={setOpen}>
        <SectionAccordionItem
          value="notifications"
          title="Notifications"
          summary={user?.emailNotificationsEnabled === false ? 'E-mail désactivé' : 'E-mail activé'}
        >
          <NotificationPreferencesCard />
        </SectionAccordionItem>

        {children.length > 0 && (
          <SectionAccordionItem
            value="enfants"
            title="Mes enfants"
            summary={children.map((child) => child.firstName).join(', ')}
          >
            <MyChildrenCard personas={children} />
          </SectionAccordionItem>
        )}

        {ownPlayerIds.length > 0 && <ParentAccessCard playerIds={ownPlayerIds} />}

        {adminClubs.length > 0 && (
          <SectionAccordionItem value="club" title="Club actif" summary={activeClub?.name}>
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
          </SectionAccordionItem>
        )}
      </SectionAccordion>

      <div className="flex flex-wrap items-center gap-2">
        {showCreateClub && (
          <Button asChild variant="outline">
            <Link to="/clubs/new">Créer un club</Link>
          </Button>
        )}
        <Button variant="outline" disabled={isLoggingOut} onClick={() => logout()}>
          Se déconnecter
        </Button>
      </div>
    </PageContainer>
  );
}
