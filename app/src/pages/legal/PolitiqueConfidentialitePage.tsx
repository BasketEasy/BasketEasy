import { Link } from 'react-router-dom';
import { TextLink } from '@basketeasy/ui/text-link';
import { LegalPageLayout } from './LegalPageLayout';
import { LegalSection, LegalSubHeading, P, LegalList, LegalTable, MailLink } from './legalContent';

export function PolitiqueConfidentialitePage() {
  return (
    <LegalPageLayout
      title="Politique de confidentialité"
      lastUpdated="9 septembre 2026"
      currentPath="/confidentialite"
    >
      <LegalSection title="1. Qui est responsable de vos données ?">
        <P>Le responsable du traitement des données collectées via Kluvo est :</P>
        <P>
          Johan Chrillesen, entrepreneur individuel, SIREN 109621060, domicilié 99 Boulevard Ernest
          Dalby, Appartement 14, 44000 Nantes, France.
        </P>
        <P>
          Contact : <MailLink />
        </P>
      </LegalSection>

      <LegalSection title="2. Quelles données sont collectées ?">
        <LegalTable
          columns={['Catégorie de données', 'Exemples', 'Concerne des mineurs ?']}
          rows={[
            ['Identité', 'Nom, prénom, date de naissance', 'Oui'],
            ['Contact', 'Email, téléphone', 'Oui (via responsable légal)'],
            ['Licence sportive', 'Numéro de licence FFBB, club, catégorie', 'Oui'],
            ['Données de jeu', 'Statistiques de match, temps de jeu, feuilles de marque', 'Oui'],
            ['Connexion', 'Logs techniques, adresse IP', 'Oui'],
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Pourquoi ces données sont-elles collectées ? (finalités et bases légales)">
        <LegalTable
          columns={['Finalité', 'Base légale (art. 6 RGPD)']}
          rows={[
            ['Gestion du compte utilisateur', 'Exécution du contrat (art. 6.1.b)'],
            ['Gestion d’équipe, calendrier, convocations', 'Exécution du contrat (art. 6.1.b)'],
            ['Suivi de licence', 'Exécution du contrat (art. 6.1.b)'],
            ['Feuilles de marque et statistiques (OCR/IA)', 'Exécution du contrat (art. 6.1.b)'],
            ['Sécurité et prévention de la fraude', 'Intérêt légitime (art. 6.1.f)'],
            ['Emails transactionnels et notifications', 'Exécution du contrat (art. 6.1.b)'],
            [
              'Compte d’un mineur',
              'Consentement du titulaire de l’autorité parentale (art. 8 RGPD)',
            ],
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Qui a accès à vos données ?">
        <LegalList
          items={[
            "L'équipe Kluvo (accès limité au nécessaire).",
            'Le club et les encadrants concernés (coachs, dirigeants), pour les données nécessaires à la gestion de l’équipe.',
          ]}
        />
        <P>Les sous-traitants techniques suivants :</P>
        <LegalTable
          columns={['Sous-traitant', 'Rôle', 'Localisation']}
          rows={[
            ['Scaleway', 'Hébergement serveur et base de données', 'France'],
            [
              'Cloudflare',
              'DNS, distribution du site, stockage des sauvegardes',
              'UE / États-Unis',
            ],
            ['Brevo', 'Envoi d’emails transactionnels', 'France / UE'],
            [
              'Gemini AI Studio (Google)',
              'Lecture automatisée des feuilles de marque (OCR/IA), uniquement lorsqu’une feuille de marque est envoyée',
              'UE / États-Unis — un transfert hors UE est possible selon la configuration retenue',
            ],
          ]}
        />
        <P>
          Aucune donnée n&apos;est vendue à des tiers. Le seul traitement pour lequel un transfert
          hors Union européenne est possible aujourd&apos;hui est la lecture automatisée des
          feuilles de marque par Gemini AI Studio (Google), et uniquement pour les clubs qui
          utilisent cette fonctionnalité.
        </P>
      </LegalSection>

      <LegalSection title="5. Combien de temps vos données sont-elles conservées ?">
        <P>
          La durée de conservation dépend de la catégorie de donnée, conformément au principe de
          minimisation (article 5 RGPD) :
        </P>
        <LegalTable
          columns={['Donnée', 'Durée de conservation']}
          rows={[
            [
              'Compte utilisateur inactif',
              'Suppression automatique après 12 mois sans connexion. Le compte est dissocié du club (les statistiques et l’historique du club sont conservés), et les données personnelles propres au compte sont effacées.',
            ],
            [
              'Journaux de sécurité (connexions, tentatives échouées)',
              '12 mois, conformément aux recommandations de la CNIL en matière de conservation des logs.',
            ],
            [
              'Statistiques de match, historique d’équipe',
              'Conservées tant que le club existe sur Kluvo : elles appartiennent à l’historique sportif du club, indépendamment du compte du joueur qui y est associé.',
            ],
            [
              'Preuve d’autorisation parentale',
              '5 ans à compter de la suppression du compte ou du profil du mineur concerné (art. 17.3.b RGPD — conservation nécessaire à la constatation, l’exercice ou la défense d’un droit en justice).',
            ],
            [
              'Photos de feuilles de marque et données envoyées à Gemini AI Studio',
              '12 mois, alignées sur la durée de conservation des données de jeu qu’elles permettent de produire.',
            ],
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Vos droits">
        <P>
          Conformément aux articles 15 à 22 du RGPD, vous disposez des droits suivants sur vos
          données :
        </P>
        <LegalList
          items={[
            <>
              <strong>Droit d&apos;accès</strong> : obtenir une copie de vos données.
            </>,
            <>
              <strong>Droit de rectification</strong> : corriger des données inexactes.
            </>,
            <>
              <strong>Droit à l&apos;effacement</strong> : demander la suppression de vos données.
            </>,
            <>
              <strong>Droit à la limitation</strong> : geler temporairement un traitement contesté.
            </>,
            <>
              <strong>Droit à la portabilité</strong> : récupérer vos données dans un format
              réutilisable.
            </>,
            <>
              <strong>Droit d&apos;opposition</strong> : vous opposer à un traitement fondé sur
              l&apos;intérêt légitime.
            </>,
          ]}
        />
        <P>
          Pour exercer ces droits : <MailLink />. Une réponse sera apportée dans un délai maximum
          d&apos;un mois (art. 12 RGPD).
        </P>
        <P>
          Pour les comptes mineurs, ces droits sont exercés par le titulaire de l&apos;autorité
          parentale.
        </P>
        <P>
          Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une
          réclamation auprès de la CNIL (cnil.fr).
        </P>
      </LegalSection>

      <LegalSection title="7. Sécurité">
        <P>
          Des mesures techniques et organisationnelles sont mises en œuvre pour protéger vos
          données, notamment :
        </P>

        <LegalSubHeading>Comptes et mots de passe</LegalSubHeading>
        <LegalList
          items={[
            'Les mots de passe ne sont jamais stockés en clair : ils sont hachés avec Argon2, l’algorithme de hachage recommandé par l’ANSSI et l’OWASP.',
            'L’authentification repose sur un jeton d’accès (JWT) à courte durée de vie, renouvelé via un jeton de rafraîchissement à usage unique et à durée de vie plus longue.',
            'Ce jeton de rafraîchissement n’est jamais stocké en clair côté serveur : seule son empreinte (hash) est conservée, et il est transmis au navigateur dans un cookie inaccessible au code JavaScript (httpOnly), envoyé uniquement en HTTPS (Secure).',
            'Chaque famille de jetons de rafraîchissement est surveillée : la réutilisation d’un jeton déjà consommé (signe probable d’un vol) entraîne la révocation immédiate de toute la famille, déconnectant l’ensemble des sessions concernées.',
            'La réinitialisation d’un mot de passe révoque automatiquement toutes les sessions actives du compte.',
            'L’adresse email est vérifiée avant que le compte puisse créer un club, inviter des membres ou nommer des responsables d’équipe.',
          ]}
        />

        <LegalSubHeading>Accès aux données</LegalSubHeading>
        <LegalList
          items={[
            'Chaque action est vérifiée selon le rôle de l’utilisateur au sein du club et/ou de l’équipe concernée (dirigeant, responsable d’équipe, membre) : un utilisateur ne peut agir que sur les clubs et équipes auxquels il est rattaché.',
            'Les jeux de données partagés entre plusieurs clubs (équipes en entente/CTC) restent limités aux clubs effectivement liés à l’équipe.',
            'Un journal d’audit dédié enregistre les évènements d’authentification (connexions, échecs de connexion, réinitialisations de mot de passe) pour détecter et investiguer une activité anormale, indépendamment de son propre usage interne, et est lui-même soumis à une durée de conservation de 12 mois.',
          ]}
        />

        <LegalSubHeading>Infrastructure</LegalSubHeading>
        <LegalList
          items={[
            'Toutes les communications entre votre navigateur et les serveurs de Kluvo sont chiffrées en HTTPS/TLS.',
            'Les données sont hébergées en France (Scaleway) et distribuées via Cloudflare, avec des sauvegardes régulières.',
            'Les photos de feuilles de marque sont stockées sur un espace de stockage dédié en zone UE (Cloudflare R2).',
            'Les identifiants et secrets d’infrastructure (clés d’API, secrets de session) ne sont jamais exposés au navigateur et sont gérés par des variables d’environnement côté serveur.',
          ]}
        />
      </LegalSection>

      <LegalSection title="8. Cookies et traceurs">
        <P>
          Kluvo n&apos;utilise aucun cookie de mesure d&apos;audience, de publicité ou de traçage.
        </P>
        <P>
          Un seul cookie est déposé, à des fins strictement techniques : il conserve votre jeton de
          rafraîchissement pour maintenir votre session connectée. Ce cookie est{' '}
          <strong>httpOnly</strong> (inaccessible en JavaScript) et n&apos;est envoyé qu&apos;en
          HTTPS. Il est strictement nécessaire au fonctionnement du service que vous avez demandé
          (rester connecté) et est donc exempté de consentement au titre de l&apos;article 82 de la
          loi Informatique et Libertés (directive ePrivacy) — mais vous êtes libre de le refuser en
          vous déconnectant, ce qui vous demandera de vous reconnecter à chaque visite.
        </P>
        <P>
          Si vous activez les notifications push depuis votre navigateur, celui-ci enregistre un
          identifiant d&apos;abonnement (géré par votre navigateur, pas par un cookie) uniquement
          pour vous transmettre les notifications que vous avez explicitement activées ; vous pouvez
          désactiver cet abonnement à tout moment depuis vos paramètres de compte.
        </P>
      </LegalSection>

      <LegalSection title="9. Mineurs">
        <P>
          Kluvo peut être utilisé par des mineurs licenciés. La création d&apos;un compte pour un
          mineur requiert l&apos;autorisation préalable du titulaire de l&apos;autorité parentale.
          Cette autorisation est recueillie par le club ou l&apos;adulte encadrant de son côté ;
          celui-ci atteste l&apos;avoir obtenue via une case à cocher lors de l&apos;inscription du
          mineur sur Kluvo. Les données des mineurs ne sont utilisées que pour les finalités
          décrites ci-dessus, avec une vigilance renforcée sur leur minimisation et leur sécurité.
        </P>
      </LegalSection>

      <LegalSection title="10. Modification de cette politique">
        <P>
          Cette politique peut être mise à jour. Les utilisateurs seront informés de toute
          modification substantielle par email ou notification dans l&apos;application.
        </P>
      </LegalSection>

      <LegalSection title="11. Contact">
        <P>
          Pour toute question relative à vos données personnelles : <MailLink />
        </P>
        <P>
          Pour la liste complète des traitements réalisés, leurs bases légales et sous-traitants,
          voir le{' '}
          <TextLink asChild>
            <Link to="/registre-traitements">Registre des activités de traitement</Link>
          </TextLink>
          .
        </P>
      </LegalSection>
    </LegalPageLayout>
  );
}
