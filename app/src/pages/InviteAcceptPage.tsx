import { useParams } from 'react-router-dom';
import { PageContainer } from '@basketeasy/ui/page-container';
import { InviteAcceptForm } from '../invites/InviteAcceptForm';

// A third case alongside PublicOnlyRoute/ProtectedRoute: this route must
// work for a logged-out visitor regardless of session state, so it sits at
// the top level rather than under either guard.
export function InviteAcceptPage() {
  const { token = '' } = useParams<{ token: string }>();
  return (
    <PageContainer size="md" centered>
      <InviteAcceptForm token={token} />
    </PageContainer>
  );
}
