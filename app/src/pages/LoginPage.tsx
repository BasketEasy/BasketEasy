import { useNavigate } from 'react-router-dom';
import { LoginForm } from '../auth/LoginForm';

export function LoginPage() {
  const navigate = useNavigate();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <LoginForm onSwitchToRegister={() => navigate('/register')} />
    </main>
  );
}
