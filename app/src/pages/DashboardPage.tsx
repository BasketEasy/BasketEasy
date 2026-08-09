import { Button } from '@basketeasy/ui/button';
import { PageContainer } from '@basketeasy/ui/page-container';
import { HealthStatus } from '../components/HealthStatus';
import { useAccount } from '../auth/useAccount';
import { useLogout } from '../auth/mutations';

export function DashboardPage() {
  const { user } = useAccount();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();

  return (
    <PageContainer size="lg">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="m-0 text-4xl">Tableau de bord</h1>
          {user && <p className="mt-1 text-muted">{user.email}</p>}
        </div>
        <Button variant="outline" disabled={isLoggingOut} onClick={() => logout()}>
          Se déconnecter
        </Button>
      </div>

      <HealthStatus />
    </PageContainer>
  );
}
