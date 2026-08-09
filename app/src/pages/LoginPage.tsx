import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@basketeasy/ui/page-container';
import { LoginForm } from '../auth/LoginForm';

export function LoginPage() {
  const navigate = useNavigate();

  return (
    <PageContainer size="md" centered>
      <LoginForm onSwitchToRegister={() => navigate('/register')} />
    </PageContainer>
  );
}
