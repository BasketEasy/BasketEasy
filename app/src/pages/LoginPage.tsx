import { PageContainer } from '@basketeasy/ui/page-container';
import { LoginForm } from '../auth/LoginForm';

export function LoginPage() {
  return (
    <PageContainer size="md" centered>
      <LoginForm />
    </PageContainer>
  );
}
