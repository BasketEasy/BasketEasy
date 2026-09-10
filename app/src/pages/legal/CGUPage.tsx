import { Link } from 'react-router-dom';
import { TextLink } from '@basketeasy/ui/text-link';
import { LegalPageLayout } from './LegalPageLayout';
import { LegalSection, P, LegalList, MailLink } from './legalContent';

export function CGUPage() {
  return (
    <LegalPageLayout
      title="Conditions Générales d'Utilisation"
      lastUpdated="9 septembre 2026"
      currentPath="/cgu"
    >
      <LegalSection title="1. Objet et champ d'application">
        <P>
          Les présentes Conditions Générales d&apos;Utilisation (« CGU ») régissent l&apos;accès et
          l&apos;utilisation du service Kluvo, logiciel en tant que service (SaaS) de gestion pour
          clubs et équipes de basketball, accessible sur kluvo.net (le « Service »).
        </P>
        <P>
          Éditeur : Johan Chrillesen, entrepreneur individuel, SIREN 109621060, domicilié 99
          Boulevard Ernest Dalby, Appartement 14, 44000 Nantes, France. Contact : <MailLink />.
        </P>
        <P>
          Le Service est fourni gratuitement à ce jour. En créant un compte, l&apos;utilisateur
          accepte sans réserve les présentes CGU.
        </P>
      </LegalSection>

      <LegalSection title="2. Description du Service">
        <P>
          Kluvo est un logiciel SaaS destiné aux clubs, équipes et licenciés de basketball, incluant
          selon les fonctionnalités disponibles : gestion d&apos;équipe, calendrier et convocations,
          suivi de licence, capture de feuilles de marque assistée par intelligence artificielle,
          suivi du temps de jeu, et outils de coordination associés.
        </P>
        <P>
          Kluvo n&apos;est pas affilié à la Fédération Française de Basketball (FFBB) et ne remplace
          pas les outils fédéraux officiels (FBI, e-Marque). Kluvo est un outil complémentaire.
        </P>
      </LegalSection>

      <LegalSection title="3. Accès, création de compte et utilisateurs mineurs">
        <LegalList
          items={[
            'Le Service est ouvert aux clubs, coachs, joueurs et responsables légaux.',
            <>
              <strong>Utilisateurs mineurs</strong> : les joueurs mineurs peuvent disposer d&apos;un
              compte direct. La création d&apos;un compte pour un mineur nécessite
              l&apos;autorisation préalable du titulaire de l&apos;autorité parentale, conformément
              à l&apos;article 8 du RGPD relatif au consentement parental pour les services de la
              société de l&apos;information. Le club ou l&apos;adulte encadrant recueille cette
              autorisation de son côté et atteste, via une case à cocher lors de l&apos;inscription
              du mineur, avoir obtenu ce consentement préalablement à la création du compte.
            </>,
            'Chaque utilisateur est responsable de la confidentialité de ses identifiants et de toute activité effectuée depuis son compte.',
            "L'utilisateur s'engage à fournir des informations exactes, conformément à l'article 1112-1 du Code civil sur le devoir d'information précontractuelle.",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Gratuité du Service et évolution future">
        <P>
          Le Service est actuellement fourni gratuitement, sans contrepartie financière.
          L&apos;éditeur se réserve le droit de faire évoluer le modèle économique dans le futur
          (passage à un modèle freemium ou payant), moyennant une information préalable des
          utilisateurs et la mise à jour des présentes CGU en conséquence, sans obligation de
          maintenir la gratuité totale dans le temps.
        </P>
      </LegalSection>

      <LegalSection title="5. Données personnelles et RGPD">
        <LegalList
          items={[
            'Les données sont hébergées en France/Union européenne, conformément aux exigences des articles 44 et suivants du RGPD relatifs aux transferts de données hors UE.',
            'Kluvo traite des données pouvant inclure des données de mineurs (nom, prénom, numéro de licence, statistiques de jeu). Ce traitement est limité aux finalités du Service, dans le respect des principes de minimisation (article 5 RGPD) et de licéité (article 6 RGPD).',
            <>
              Responsable de traitement : Johan Chrillesen (SIREN 109621060), <MailLink />.
            </>,
            <>
              Droits d&apos;accès, de rectification, d&apos;effacement, de limitation et de
              portabilité (articles 15 à 20 RGPD) : exercice via <MailLink />. L&apos;utilisateur
              dispose également du droit d&apos;introduire une réclamation auprès de la CNIL
              (article 77 RGPD).
            </>,
            "Sous-traitants et hébergeurs : Scaleway (hébergement, France), Cloudflare (DNS, frontend, stockage sauvegardes, UE/États-Unis), Brevo (emails, France/UE), Gemini AI Studio de Google (lecture automatisée des feuilles de marque, UE/États-Unis). Scaleway, Cloudflare et Brevo agissent conformément à l'article 28 du RGPD ; l'accord de traitement des données (DPA) avec Google pour Gemini AI Studio est en cours de vérification.",
          ]}
        />
        <P>
          Pour le détail complet des mesures de sécurité, des traitements, durées de conservation et
          bases légales, voir la{' '}
          <TextLink asChild>
            <Link to="/confidentialite">Politique de confidentialité</Link>
          </TextLink>{' '}
          et le{' '}
          <TextLink asChild>
            <Link to="/registre-traitements">Registre des activités de traitement</Link>
          </TextLink>
          .
        </P>
      </LegalSection>

      <LegalSection title="6. Propriété intellectuelle et contenu utilisateur">
        <LegalList
          items={[
            "Le logiciel Kluvo, sa structure, ses bases de données et ses éléments graphiques sont protégés par le droit d'auteur (Code de la propriété intellectuelle, notamment articles L111-1 et L112-2) et restent la propriété exclusive de l'éditeur. Toute reproduction non autorisée est susceptible de constituer une contrefaçon (articles L335-2 et suivants du CPI).",
            "Les utilisateurs restent propriétaires des contenus qu'ils publient (photos de feuilles de marque, statistiques, messages) et concèdent à l'éditeur une licence limitée nécessaire à la fourniture du Service.",
            "Les utilisateurs garantissent disposer des droits nécessaires sur les contenus soumis, notamment le droit à l'image des mineurs figurant sur les photos, conformément à l'article 9 du Code civil.",
            'Kluvo peut traiter ces contenus (notamment par OCR/IA sur les feuilles de marque) uniquement aux fins de fourniture du Service.',
          ]}
        />
      </LegalSection>

      <LegalSection title="7. Obligations de l'utilisateur">
        <P>L&apos;utilisateur s&apos;engage à ne pas :</P>
        <LegalList
          items={[
            'utiliser le Service à des fins illicites ou détournées de son objet ;',
            "porter atteinte aux droits de tiers, notamment au droit à l'image et aux données personnelles des mineurs ;",
            "tenter de compromettre la sécurité, l'intégrité ou la disponibilité du Service, ce qui pourrait constituer une infraction au sens des articles 323-1 et suivants du Code pénal relatifs aux atteintes aux systèmes de traitement automatisé de données.",
          ]}
        />
      </LegalSection>

      <LegalSection title="8. Disponibilité, garanties et responsabilité">
        <LegalList
          items={[
            "Le Service est fourni « en l'état », en phase pilote, sans garantie de disponibilité continue.",
            "Conformément à l'article 1231-1 du Code civil, l'éditeur ne pourra être tenu responsable des interruptions, pertes de données ou dysfonctionnements que dans les limites permises par la loi, compte tenu de la nature gratuite et expérimentale du Service.",
            "Des sauvegardes sont réalisées mais aucune garantie de récupération intégrale n'est donnée.",
            "En tout état de cause, la responsabilité de l'éditeur ne saurait être engagée en cas de force majeure au sens de l'article 1218 du Code civil.",
          ]}
        />
      </LegalSection>

      <LegalSection title="9. Durée, résiliation et suspension">
        <LegalList
          items={[
            <>
              Chaque utilisateur peut supprimer son compte à tout moment via demande à <MailLink />.
            </>,
            "L'éditeur peut suspendre ou supprimer un compte en cas de non-respect des présentes CGU, après mise en demeure lorsque les circonstances le permettent.",
          ]}
        />
      </LegalSection>

      <LegalSection title="10. Droit applicable et litiges">
        <P>
          Les présentes CGU sont soumises au droit français. En cas de litige, une solution amiable
          sera recherchée en priorité ; à défaut, les tribunaux français compétents seront saisis.
        </P>
      </LegalSection>

      <LegalSection title="11. Modification des CGU">
        <P>
          L&apos;éditeur peut modifier les présentes CGU à tout moment. Les utilisateurs seront
          informés des modifications substantielles par email ou notification dans
          l&apos;application.
        </P>
      </LegalSection>

      <LegalSection title="12. Contact">
        <P>
          Pour toute question : <MailLink />
        </P>
      </LegalSection>
    </LegalPageLayout>
  );
}
