import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Heading } from '@basketeasy/ui/heading';
import { PageContainer } from '@basketeasy/ui/page-container';
import { Text } from '@basketeasy/ui/text';

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

    // No bottom-bar clearance: this replaces the whole tree, tab bar
    // included, and on a centered page the reserved padding would only push
    // the message off the vertical axis.
    return (
      <PageContainer size="md" centered bottomNav={false}>
        <div className="flex flex-col items-center gap-4 text-center">
          <Heading as="h1">Une erreur est survenue</Heading>
          <Text variant="meta">
            Quelque chose s’est mal passé de notre côté. Rechargez la page pour reprendre.
          </Text>
          <Button onClick={() => window.location.reload()}>Recharger la page</Button>
        </div>
      </PageContainer>
    );
  }
}
