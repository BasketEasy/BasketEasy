import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@basketeasy/ui/button';
import { ErrorScreen } from './ErrorScreen';

/**
 * Class component because React has no hook equivalent of
 * componentDidCatch. Without this, any render-time throw unmounts the whole
 * SPA to a white screen with no message and no way back.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <ErrorScreen
        eyebrow="Erreur"
        title="Une erreur est survenue"
        description="Quelque chose s’est mal passé de notre côté. Rechargez la page pour reprendre."
        action={
          <Button className="w-full" onClick={() => window.location.reload()}>
            Recharger la page
          </Button>
        }
      />
    );
  }
}
