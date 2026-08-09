import { Card, CardHeader, CardTitle, CardContent } from '@basketeasy/ui/card';
import { AccountProfileForm } from '../account/AccountProfileForm';

export function AccountPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Mon compte</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountProfileForm />
        </CardContent>
      </Card>
    </main>
  );
}
