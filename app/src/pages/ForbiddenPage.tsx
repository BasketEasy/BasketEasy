import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { ErrorScreen } from '../components/ErrorScreen';

export function ForbiddenPage() {
  return (
    <ErrorScreen
      eyebrow="Erreur 403"
      title="Accès non autorisé"
      description="Vous n’êtes pas administrateur de ce club."
      action={
        <Button asChild className="w-full">
          <Link to="/dashboard">Retour au tableau de bord</Link>
        </Button>
      }
    />
  );
}
