import { useNavigate } from 'react-router-dom';
import { RegisterForm } from '../auth/RegisterForm';

export function RegisterPage() {
  const navigate = useNavigate();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <RegisterForm onSwitchToLogin={() => navigate('/login')} />
    </main>
  );
}
