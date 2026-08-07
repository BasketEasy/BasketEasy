import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { HealthStatus } from './components/HealthStatus';
import { useAuth } from './auth/AuthContext';
import { LoginForm } from './auth/LoginForm';
import { RegisterForm } from './auth/RegisterForm';

export default function App() {
  const { user, isLoading, logout } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'register'>('login');

  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '64px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: 40 }}>BasketEasy</h1>
        <p style={{ color: 'var(--be-muted)', margin: '6px 0 0' }}>
          La gestion d'équipe, simplifiée.
        </p>
      </div>

      <HealthStatus />

      {!isLoading && !user && authView === 'login' && (
        <LoginForm onSwitchToRegister={() => setAuthView('register')} />
      )}
      {!isLoading && !user && authView === 'register' && (
        <RegisterForm onSwitchToLogin={() => setAuthView('login')} />
      )}
      {!isLoading && user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span>{user.email}</span>
          <Button variant="outline" onClick={() => void logout()}>
            Se déconnecter
          </Button>
        </div>
      )}
    </main>
  );
}
