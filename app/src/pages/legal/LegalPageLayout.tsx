import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageContainer } from '@basketeasy/ui/page-container';
import { PageHeader } from '@basketeasy/ui/page-header';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import { PublicHeader } from '../../components/PublicHeader';

const LEGAL_PAGES = [
  { to: '/mentions-legales', label: 'Mentions légales' },
  { to: '/confidentialite', label: 'Politique de confidentialité' },
  { to: '/cgu', label: "Conditions d'utilisation" },
  { to: '/registre-traitements', label: 'Registre des traitements' },
] as const;

/**
 * Shared shell for the four legal documents. Renders as regular HTML (not a
 * downloaded PDF) so the content is actually readable and linkable — the
 * task these pages exist for. Each page supplies its own <h2>/<h3>/<p>
 * content via `legalContent.tsx`'s helpers as `children`.
 */
export function LegalPageLayout({
  title,
  lastUpdated,
  currentPath,
  children,
}: {
  title: string;
  lastUpdated: string;
  currentPath: (typeof LEGAL_PAGES)[number]['to'];
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-ground text-charcoal">
      <PublicHeader />
      {/* size="lg" (not the narrower "md", meant for centered forms) so a
          multi-column table (registre des traitements) has room before it
          needs to fall back to its own horizontal scroll; prose content is
          then re-narrowed to max-w-3xl below for readability. */}
      <PageContainer size="lg" className="gap-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
          <Text variant="eyebrow">Documents légaux</Text>
          <PageHeader
            title={title}
            meta={
              <>
                Dernière mise à jour : <span className="tabular">{lastUpdated}</span>
              </>
            }
          />
        </div>

        <nav
          aria-label="Documents légaux"
          className="mx-auto flex w-full max-w-3xl flex-wrap gap-x-4 gap-y-2"
        >
          {LEGAL_PAGES.map((page) =>
            page.to === currentPath ? (
              <Text
                key={page.to}
                as="span"
                variant="label"
                size="sm"
                tone="brand"
                aria-current="page"
              >
                {page.label}
              </Text>
            ) : (
              <TextLink key={page.to} asChild size="sm">
                <Link to={page.to}>{page.label}</Link>
              </TextLink>
            ),
          )}
        </nav>

        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">{children}</div>
      </PageContainer>
    </div>
  );
}
