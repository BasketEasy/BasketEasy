import { Card, CardHeader, CardTitle, CardContent } from '@basketeasy/ui/card';
import { PageContainer } from '@basketeasy/ui/page-container';
import { AccountProfileForm } from '../account/AccountProfileForm';

export function AccountPage() {
  return (
    <PageContainer size="md">
      <Card>
        <CardHeader>
          <CardTitle>Mon compte</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountProfileForm />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
