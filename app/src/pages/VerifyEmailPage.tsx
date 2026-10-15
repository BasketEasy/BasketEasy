import { useParams } from 'react-router-dom';
import { PageContainer } from '@basketeasy/ui/page-container';
import { VerifyEmailCard } from '../auth/VerifyEmailCard';

// Top-level: the link is opened from an inbox, often on a different device
// from the one the account was created on, so it must work with no session.
export function VerifyEmailPage() {
  const { token = '' } = useParams<{ token: string }>();
  return (
    <PageContainer size="md" centered>
      <VerifyEmailCard token={token} />
    </PageContainer>
  );
}
