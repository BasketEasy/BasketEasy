import { useParams } from 'react-router-dom';
import { PageContainer } from '@basketeasy/ui/page-container';
import { GuardianInviteCard } from '../guardians/GuardianInviteCard';

// Top level, beside /invite/:token and for the same reason: the link is
// opened from a message, and a visitor still holding a session (a parent who
// already plays) must land here rather than be bounced to the dashboard.
export function GuardianInvitePage() {
  const { token = '' } = useParams<{ token: string }>();
  return (
    <PageContainer size="md" centered>
      <GuardianInviteCard token={token} />
    </PageContainer>
  );
}
