import { PageContainer } from '@basketeasy/ui/page-container';
import { RegisterForm } from '../auth/RegisterForm';

export function RegisterPage() {
  return (
    <PageContainer size="md" centered>
      <RegisterForm />
    </PageContainer>
  );
}
