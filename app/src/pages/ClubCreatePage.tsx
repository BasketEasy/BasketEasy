import { PageContainer } from '@basketeasy/ui/page-container';
import { PageHeader } from '@basketeasy/ui/page-header';
import { PageBackLink, PageBar } from '../components/PageBar';
import { ClubCreateForm } from '../clubs/ClubCreateForm';

export function ClubCreatePage() {
  return (
    <>
      <PageBar to="/account" title="Mon compte" />
      <PageContainer size="md" top="bar">
        <PageBackLink to="/account" title="Mon compte" />
        <PageHeader title="Créer un club" meta="Vous en serez le premier administrateur." />
        <ClubCreateForm />
      </PageContainer>
    </>
  );
}
