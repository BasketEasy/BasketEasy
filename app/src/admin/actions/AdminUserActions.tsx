import { Button } from '@basketeasy/ui/button';
import type { AdminUserDetail } from '@basketeasy/types/platform-admin-browse';
import { AdminActionDialog, type AdminActionFact } from './AdminActionDialog';
import { AdminActionRow, AdminActionsCard } from './AdminActionsCard';
import { usePlatformSession } from '../platformSession';

/** Account fixes: verification, password reset, sessions. */
export function AdminUserActions({ user }: { user: AdminUserDetail }) {
  const id = user.person.id;
  const account: AdminActionFact = {
    label: 'Compte',
    value: user.person.email ?? `${user.person.displayName} (…@${user.person.emailDomain ?? ''})`,
  };
  const sessions = user.activeSessionCount;
  const { session } = usePlatformSession();
  const isDataOfficer = session?.role === 'DATA_OFFICER';

  return (
    <AdminActionsCard>
      {!user.emailVerified && (
        <>
          <AdminActionRow
            title="Renvoyer l’e-mail de vérification"
            detail="Adresse non vérifiée"
            action={
              <AdminActionDialog
                trigger={<Button variant="outline">Renvoyer</Button>}
                title="Renvoyer la vérification"
                description="Un nouveau lien de vérification, valable 24 heures, part vers l’adresse du compte."
                facts={[account]}
                confirmLabel="Renvoyer l’e-mail"
                path={`users/${id}/resend-verification`}
              />
            }
          />
          {/* DATA_OFFICER-only on the server: it lifts EmailVerifiedGuard. */}
          {isDataOfficer && (
            <AdminActionRow
              title="Marquer l’adresse vérifiée"
              detail="Vérifiée par un autre moyen"
              action={
                <AdminActionDialog
                  trigger={<Button variant="outline">Marquer</Button>}
                  title="Marquer l’adresse vérifiée"
                  description="À utiliser seulement quand la personne a prouvé autrement qu’elle contrôle cette adresse. Débloque la création de club et l’ajout de membres."
                  facts={[account]}
                  confirmLabel="Marquer vérifiée"
                  path={`users/${id}/mark-verified`}
                />
              }
            />
          )}
        </>
      )}
      <AdminActionRow
        title="Envoyer un lien de réinitialisation"
        detail="Le support ne voit jamais le mot de passe"
        action={
          <AdminActionDialog
            trigger={<Button variant="outline">Envoyer</Button>}
            title="Envoyer un lien de réinitialisation"
            description="Le lien part vers l’adresse du compte et expire dans une heure. Une fois utilisé, toutes les sessions sont fermées."
            facts={[account]}
            confirmLabel="Envoyer le lien"
            path={`users/${id}/send-password-reset`}
          />
        }
      />
      <AdminActionRow
        title="Révoquer les sessions"
        detail={
          sessions === 0
            ? 'Aucun appareil connecté'
            : `${sessions} appareil${sessions > 1 ? 's' : ''} connecté${sessions > 1 ? 's' : ''}`
        }
        action={
          <AdminActionDialog
            trigger={
              <Button variant="outline" disabled={sessions === 0}>
                Révoquer
              </Button>
            }
            title="Révoquer les sessions"
            description="Tous les appareils du compte seront déconnectés d’ici quelques minutes. Son mot de passe ne change pas."
            facts={[account, { label: 'Sessions actives', value: sessions }]}
            confirmLabel="Révoquer les sessions"
            danger
            path={`users/${id}/revoke-sessions`}
          />
        }
      />
    </AdminActionsCard>
  );
}
