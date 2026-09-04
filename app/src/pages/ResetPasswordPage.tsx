import { useParams } from 'react-router-dom';
import { PageContainer } from '@basketeasy/ui/page-container';
import { ResetPasswordForm } from '../auth/ResetPasswordForm';

// Top-level, like /invite/:token: someone recovering an account may well
// still hold a stale session in this browser, and PublicOnlyRoute would
// bounce them to the dashboard instead of letting them finish the reset.
export function ResetPasswordPage() {
  const { token = '' } = useParams<{ token: string }>();
  return (
    <PageContainer size="md" centered>
      <ResetPasswordForm token={token} />
    </PageContainer>
  );
}
