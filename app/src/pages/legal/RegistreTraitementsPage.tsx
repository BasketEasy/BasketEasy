import { LegalPageLayout } from './LegalPageLayout';
import { LegalSection, LegalSubHeading, P, LegalTable, MailLink } from './legalContent';

type Traitement = {
  numero: number;
  titre: string;
  finalite: string;
  baseLegale: string;
  personnes: string;
  donnees: string;
  destinataires: string;
  outilsTiers?: string;
  duree: string;
  sousTraitants?: string;
  transferts: string;
  securite: string;
};

const TRAITEMENTS: Traitement[] = [
  {
    numero: 1,
    titre: 'Gestion des comptes utilisateurs',
    finalite: 'Création et gestion des comptes (clubs, coachs, joueurs, responsables légaux)',
    baseLegale:
      'Exécution du contrat (art. 6.1.b) ; consentement parental pour les mineurs (art. 8)',
    personnes: 'Utilisateurs adultes, mineurs licenciés, responsables légaux',
    donnees:
      'Identité (nom, prénom, date de naissance), email, mot de passe (haché avec Argon2), rôle (club/coach/joueur)',
    destinataires: 'Équipe Kluvo, club concerné',
    duree: 'Suppression automatique après 12 mois sans connexion (sweep RGPD nocturne)',
    sousTraitants: 'Scaleway (hébergement), Cloudflare (infrastructure)',
    transferts: 'Aucun',
    securite:
      'Hachage Argon2 des mots de passe, jetons JWT + jetons de rafraîchissement à usage unique (rotation, détection de réutilisation), cookie httpOnly/Secure, HTTPS, contrôle d’accès par rôle',
  },
  {
    numero: 2,
    titre: 'Gestion d’équipe, calendrier et convocations',
    finalite: 'Organisation des entraînements, matchs, convocations',
    baseLegale: 'Exécution du contrat (art. 6.1.b)',
    personnes: 'Joueurs (dont mineurs), coachs',
    donnees: 'Nom, disponibilités, présence aux événements, coordonnées de contact',
    destinataires: 'Membres du club concerné uniquement',
    duree:
      'Conservées tant que l’équipe/le club existe sur Kluvo (historique sportif du club) ; aucune purge automatique programmée',
    sousTraitants: 'Scaleway, Cloudflare, Brevo (notifications email)',
    transferts: 'Aucun',
    securite:
      'HTTPS, contrôle d’accès par rôle (club et équipe), notifications e-mail via un fournisseur basé en France/UE',
  },
  {
    numero: 3,
    titre: 'Suivi de licence',
    finalite: 'Suivi du numéro de licence FFBB et de l’appartenance au club',
    baseLegale: 'Exécution du contrat (art. 6.1.b)',
    personnes: 'Joueurs licenciés, dont mineurs',
    donnees: 'Numéro de licence, club, catégorie',
    destinataires: 'Club concerné, encadrants habilités',
    duree: 'Conservées tant que le club existe sur Kluvo (aucune purge automatique programmée)',
    sousTraitants: 'Scaleway, Cloudflare',
    transferts: 'Aucun',
    securite: 'HTTPS, contrôle d’accès par rôle',
  },
  {
    numero: 4,
    titre: 'Feuilles de marque et statistiques de jeu (OCR/IA)',
    finalite:
      'Capture assistée par IA des feuilles de marque, calcul de statistiques et temps de jeu',
    baseLegale: 'Exécution du contrat (art. 6.1.b)',
    personnes: 'Joueurs, dont mineurs',
    donnees: 'Photos de feuilles de marque, statistiques de jeu, temps de jeu',
    destinataires: 'Club concerné',
    outilsTiers: 'Gemini AI Studio (Google)',
    duree:
      'Aucune suppression automatique à ce jour — les photos sont supprimées uniquement lors de la suppression manuelle de l’événement associé',
    transferts:
      'Un transfert hors UE est possible selon la configuration Gemini AI Studio retenue — point en cours de vérification auprès de Google',
    securite:
      'Stockage des photos en zone UE (Cloudflare R2), HTTPS, contrôle d’accès par rôle, relecture manuelle obligatoire par un responsable d’équipe avant confirmation des statistiques extraites',
  },
  {
    numero: 5,
    titre: 'Emails transactionnels et notifications',
    finalite: 'Envoi de notifications (convocations, rappels, informations de compte)',
    baseLegale: 'Exécution du contrat (art. 6.1.b)',
    personnes: 'Tous les utilisateurs',
    donnees: 'Email, contenu de la notification',
    destinataires: 'Brevo (prestataire d’envoi)',
    duree: 'Aucune suppression automatique à ce jour',
    sousTraitants: 'Brevo (France/UE)',
    transferts: 'Aucun',
    securite: 'HTTPS, contrôle d’accès par rôle, envoi via un prestataire situé en France/UE',
  },
  {
    numero: 6,
    titre: 'Logs techniques et sécurité',
    finalite: 'Sécurité du Service, prévention de la fraude, débogage',
    baseLegale: 'Intérêt légitime (art. 6.1.f)',
    personnes: 'Tous les utilisateurs',
    donnees:
      'Adresse IP, journal des évènements d’authentification (connexions, échecs de connexion, réinitialisations de mot de passe), user-agent',
    destinataires: 'Équipe Kluvo uniquement',
    duree: '12 mois',
    sousTraitants: 'Scaleway, Cloudflare',
    transferts: 'Aucun',
    securite:
      'HTTPS, contrôle d’accès par rôle, journal d’audit dédié aux évènements d’authentification, purge automatique nocturne au-delà de la durée de conservation',
  },
  {
    numero: 7,
    titre: 'Traitement des demandes d’exercice des droits (outil interne)',
    finalite:
      'Répondre aux demandes d’accès, de portabilité et d’effacement (art. 15, 17 et 20 RGPD) et contrôler l’exécution de la politique de conservation',
    baseLegale: 'Obligation légale (art. 6.1.c)',
    personnes:
      'Utilisateurs ayant exercé un droit, utilisateurs dont le compte approche de la suppression automatique, personnel Kluvo habilité',
    donnees:
      'Données du compte concerné et données qui lui sont rattachées ; motif de chaque demande ; journal des consultations, exports et effacements (date, adresse IP et user-agent de la personne habilitée)',
    destinataires:
      'Personnel Kluvo nommément habilité uniquement ; la personne concernée pour sa propre copie',
    duree:
      'Journal des consultations, exports et effacements : 12 mois, purge automatique nocturne. La copie remise à la personne est générée à la demande et n’est pas conservée sur les serveurs de Kluvo',
    sousTraitants: 'Scaleway, Cloudflare',
    transferts: 'Aucun',
    securite:
      'Habilitation individuelle attribuée hors application, double authentification par code à usage unique (TOTP), session limitée à 15 minutes, verrouillage après 5 échecs, restriction réseau optionnelle, deux niveaux d’accès (support sans donnée personnelle / délégué aux demandes), motif obligatoire avant tout export ou effacement, journalisation de chaque consultation',
  },
];

function TraitementSection({ t }: { t: Traitement }) {
  return (
    <LegalSection title={`Traitement n°${t.numero} — ${t.titre}`}>
      <LegalTable
        columns={['Champ', 'Détail']}
        rows={[
          ['Finalité', t.finalite],
          ['Base légale', t.baseLegale],
          ['Catégories de personnes concernées', t.personnes],
          ['Catégories de données', t.donnees],
          ['Destinataires', t.destinataires],
          ...(t.outilsTiers ? [['Outils tiers utilisés pour l’IA/OCR', t.outilsTiers]] : []),
          ['Durée de conservation', t.duree],
          ...(t.sousTraitants ? [['Sous-traitants', t.sousTraitants]] : []),
          ['Transferts hors UE', t.transferts],
          ['Mesures de sécurité', t.securite],
        ]}
      />
    </LegalSection>
  );
}

export function RegistreTraitementsPage() {
  return (
    <LegalPageLayout
      title="Registre des activités de traitement"
      lastUpdated="28 septembre 2026"
      currentPath="/registre-traitements"
    >
      <P>Article 30 du RGPD.</P>

      <LegalSection title="Responsable de traitement">
        <P>
          Johan Chrillesen, entrepreneur individuel, SIREN 109621060, 99 Boulevard Ernest Dalby,
          Appartement 14, 44000 Nantes, France — <MailLink />
        </P>
        <P>DPO désigné : non applicable.</P>
      </LegalSection>

      {TRAITEMENTS.map((t) => (
        <TraitementSection key={t.numero} t={t} />
      ))}

      <LegalSection title="Liste des sous-traitants (art. 28 RGPD)">
        <LegalTable
          columns={['Sous-traitant', 'Service', 'Localisation', 'DPA signé ?']}
          rows={[
            ['Scaleway', 'Hébergement serveur et base de données', 'France', 'Oui'],
            ['Cloudflare', 'DNS, CDN, stockage sauvegardes', 'UE / États-Unis', 'Oui'],
            ['Brevo', 'Envoi d’emails', 'France / UE', 'Oui'],
            [
              'Gemini AI Studio (Google)',
              'Traitement des feuilles de marque (OCR/IA)',
              'UE / États-Unis',
              'En cours de vérification',
            ],
          ]}
        />
      </LegalSection>

      <LegalSection title="Mesures de sécurité transverses">
        <LegalSubHeading>Description générale</LegalSubHeading>
        <P>
          Ces mesures s&apos;appliquent à l&apos;ensemble des traitements listés ci-dessus. Le
          détail complet est décrit dans la Politique de confidentialité, section « Sécurité » :
        </P>
        <LegalTable
          columns={['Mesure', 'Application']}
          rows={[
            [
              'Hachage des mots de passe',
              'Argon2 (recommandé par l’ANSSI/OWASP) — jamais de stockage en clair',
            ],
            [
              'Authentification',
              'Jeton d’accès JWT à courte durée de vie + jeton de rafraîchissement opaque à usage unique, stocké haché en base et groupé par famille pour détecter toute réutilisation frauduleuse',
            ],
            ['Transport des jetons de session', 'Cookie httpOnly, Secure (HTTPS uniquement)'],
            [
              'Chiffrement en transit',
              'HTTPS/TLS sur l’ensemble des échanges entre le navigateur et les serveurs',
            ],
            [
              'Contrôle d’accès',
              'Vérification du rôle de l’utilisateur (club, équipe) à chaque opération, y compris pour les équipes partagées entre plusieurs clubs (CTC)',
            ],
            [
              'Traçabilité',
              'Journal d’audit dédié aux évènements d’authentification et aux accès internes (consultation, export, effacement d’un compte), conservé 12 mois',
            ],
            [
              'Accès interne',
              'Outil interne réservé à un personnel nommément habilité, protégé par une double authentification (TOTP) et limité à ce qu’exige le traitement d’une demande d’exercice des droits',
            ],
            [
              'Hébergement',
              'Serveurs et base de données en France (Scaleway) ; sauvegardes et distribution via Cloudflare (zone UE pour le stockage des fichiers)',
            ],
            [
              'Minimisation',
              'Effacement automatique des comptes inactifs après 12 mois, dissociation du compte joueur des statistiques du club plutôt que suppression de l’historique du club',
            ],
          ]}
        />
      </LegalSection>

      <LegalSection title="Analyse d'impact (AIPD)">
        <P>Non applicable.</P>
      </LegalSection>
    </LegalPageLayout>
  );
}
