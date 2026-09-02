import { PageContainer } from '@basketeasy/ui/page-container';
import { LoginForm } from '../auth/LoginForm';

export function LoginPage() {
  // bottomNav={false}: a public route renders no bottom tab bar, so the
  // clearance PageContainer reserves by default would only push the centred
  // form off its own axis.
  return (
    <PageContainer size="md" centered bottomNav={false}>
      <LoginForm />
    </PageContainer>
  );
}
