import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@basketeasy/ui/page-container';
import { RegisterForm } from '../auth/RegisterForm';

export function RegisterPage() {
  const navigate = useNavigate();

  return (
    <PageContainer size="md" centered>
      <RegisterForm onSwitchToLogin={() => navigate('/login')} />
    </PageContainer>
  );
}
