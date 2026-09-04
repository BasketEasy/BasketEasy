import type { MailMessage } from '../mail-client';

// Kluvo's brand tokens, inlined. E-mail clients strip <style> blocks and know
// nothing about Tailwind, so this is the one place in the repo where literal
// colour values legitimately live outside packages/@basketeasy/ui's preset —
// they are copies of `orange`, `charcoal`, `cream` and `surface-2` from
// docs/brand.md, kept in sync by hand.
const ORANGE = '#D4622A';
const CHARCOAL = '#23201C';
const CREAM = '#FAF5EF';
const MUTED = '#6B6259';

export interface EmailBody {
  /** The one-line summary that becomes the subject. */
  subject: string;
  heading: string;
  /** Paragraphs, rendered in order. Plain text — no markup. */
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Closing note rendered small and muted, e.g. the raw fallback URL. */
  footnote?: string;
}

/**
 * Renders one `EmailBody` into the HTML + plain-text pair every provider
 * wants. Table-based and inline-styled on purpose: it is 2026 and Outlook
 * still does not do flexbox.
 *
 * Every template in this folder goes through here, so the brand treatment
 * and the plain-text fallback are written once rather than per message.
 */
export function renderEmail(to: string, body: EmailBody): MailMessage {
  const paragraphs = body.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${CHARCOAL};">${escapeHtml(p)}</p>`,
    )
    .join('');

  const cta = body.cta
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(body.cta.url)}" style="display:inline-block;background:${ORANGE};color:${CREAM};font-weight:700;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;">${escapeHtml(body.cta.label)}</a></p>`
    : '';

  const footnote = body.footnote
    ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${MUTED};word-break:break-all;">${escapeHtml(body.footnote)}</p>`
    : '';

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;background:${CREAM};">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;">
<tr><td style="padding:32px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<p style="margin:0 0 24px;font-size:22px;font-weight:800;color:${ORANGE};letter-spacing:-0.01em;">Kluvo</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.25;color:${CHARCOAL};">${escapeHtml(body.heading)}</h1>
${paragraphs}${cta}${footnote}
</td></tr></table>
</body></html>`;

  const text = [
    body.heading,
    '',
    ...body.paragraphs,
    ...(body.cta ? ['', `${body.cta.label} : ${body.cta.url}`] : []),
    ...(body.footnote ? ['', body.footnote] : []),
    '',
    '— Kluvo · La gestion d’équipe, simplifiée.',
  ].join('\n');

  return { to, subject: body.subject, html, text };
}

// Recipient-controlled strings reach these templates (a club name, an
// opponent name, a notification title), so every interpolation is escaped —
// an e-mail body is HTML sent to a third party, and a club named
// `<script>` must not become one.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
