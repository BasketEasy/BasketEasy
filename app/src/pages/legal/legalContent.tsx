import { type ReactNode } from 'react';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { Heading } from '@basketeasy/ui/heading';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';

/** `<h2>` for a top-level article/section — the court-line rule, per convention. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <SectionHeading as="h2">{title}</SectionHeading>
      {children}
    </section>
  );
}

/** `<h3>` for a subsection nested inside a `LegalSection`. */
export function LegalSubHeading({ children }: { children: ReactNode }) {
  return (
    <Heading as="h3" size="xl">
      {children}
    </Heading>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <Text variant="body">{children}</Text>;
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-1.5 pl-5">
      {items.map((item, index) => (
        <Text as="li" key={index} variant="body" className="list-disc">
          {item}
        </Text>
      ))}
    </ul>
  );
}

export function LegalTable({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[32rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            {columns.map((column) => (
              <th key={column} className="px-4 py-2.5">
                <Text as="span" variant="label" size="sm">
                  {column}
                </Text>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex > 0 ? 'border-t border-border' : undefined}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-2.5 align-top">
                  <Text variant="body" size="sm">
                    {cell}
                  </Text>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MailLink({ address = 'contact@kluvo.net' }: { address?: string }) {
  return (
    <TextLink asChild size="md">
      <a href={`mailto:${address}`}>{address}</a>
    </TextLink>
  );
}
