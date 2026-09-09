import { Link } from 'react-router-dom';
import { TextLink } from '@basketeasy/ui/text-link';
import { LegalPageLayout } from './LegalPageLayout';
import { LegalSection, P, MailLink } from './legalContent';

export function MentionsLegalesPage() {
  return (
    <LegalPageLayout
      title="Mentions légales"
      lastUpdated="9 septembre 2026"
      currentPath="/mentions-legales"
    >
      <P>
        Conformément aux articles 6-III et 19 de la loi n° 2004-575 du 21 juin 2004 pour la
        confiance dans l&apos;économie numérique (LCEN), il est précisé aux utilisateurs du site
        kluvo.net l&apos;identité des différents intervenants dans le cadre de sa réalisation et de
        son suivi.
      </P>

      <LegalSection title="Éditeur du site">
        <P>Johan Chrillesen, entrepreneur individuel</P>
        <P>SIREN : 109621060 · SIRET : 10962106000010 · Code APE : 6201Z</P>
        <P>Adresse : 99 Boulevard Ernest Dalby, Appartement 14, 44000 Nantes, France</P>
        <P>
          Email : <MailLink />
        </P>
        <P>
          Statut TVA : Non assujetti à la TVA — TVA non applicable, article 293 B du Code général
          des impôts (franchise en base).
        </P>
      </LegalSection>

      <LegalSection title="Directeur de la publication">
        <P>Johan Chrillesen, en sa qualité d&apos;entrepreneur individuel, éditeur du site.</P>
      </LegalSection>

      <LegalSection title="Hébergement">
        <P>
          <strong>Hébergement du site (frontend)</strong>
          <br />
          Cloudflare, Inc. — 101 Townsend Street, San Francisco, California 94107, États-Unis
          <br />
          Contact : billing@cloudflare.com
        </P>
        <P>
          <strong>Hébergement des données et serveurs applicatifs</strong>
          <br />
          Scaleway SAS — 8 rue de la Ville l&apos;Évêque, 75008 Paris, France
        </P>
      </LegalSection>

      <LegalSection title="Propriété intellectuelle">
        <P>
          L&apos;ensemble des éléments constituant le site kluvo.net (textes, graphismes, logiciels,
          logos, structure, base de données) est la propriété exclusive de l&apos;éditeur ou de ses
          partenaires, sauf mentions contraires, et est protégé par les dispositions du Code de la
          propriété intellectuelle, notamment ses articles L111-1 et suivants et L112-2. Toute
          reproduction, représentation, modification ou exploitation, totale ou partielle, sans
          autorisation préalable est interdite et pourra faire l&apos;objet de poursuites
          conformément aux articles L335-2 et suivants du Code de la propriété intellectuelle.
        </P>
      </LegalSection>

      <LegalSection title="Données personnelles">
        <P>
          Le traitement des données personnelles des utilisateurs est décrit dans la{' '}
          <TextLink asChild>
            <Link to="/confidentialite">Politique de confidentialité</Link>
          </TextLink>
          , conformément au Règlement (UE) 2016/679 (RGPD) et à la loi n° 78-17 du 6 janvier 1978
          modifiée relative à l&apos;informatique, aux fichiers et aux libertés.
        </P>
      </LegalSection>

      <LegalSection title="Crédits">
        <P>Polices de caractères utilisées :</P>
        <P>
          Big Shoulders Display (graisses 600, 700, 800) · Atkinson Hyperlegible (graisses 400, 700)
        </P>
      </LegalSection>

      <LegalSection title="Contact">
        <P>
          Pour toute question relative au site ou à son contenu : <MailLink />
        </P>
      </LegalSection>
    </LegalPageLayout>
  );
}
