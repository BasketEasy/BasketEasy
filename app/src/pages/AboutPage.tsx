import { PageContainer } from '@basketeasy/ui/page-container';
import { Heading } from '@basketeasy/ui/heading';
import { HealthStatus } from '../components/HealthStatus';

export function AboutPage() {
  return (
    <PageContainer size="lg">
      <Heading as="h1" className="m-0">
        À propos
      </Heading>
      <HealthStatus />
    </PageContainer>
  );
}
