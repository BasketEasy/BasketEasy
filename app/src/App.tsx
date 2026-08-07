import { HealthStatus } from './components/HealthStatus';

export default function App() {
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
    </main>
  );
}
