import {
  DEFAULT_CANCELLATION_TEMPLATE,
  DEFAULT_REMINDER_TEMPLATE,
  DEFAULT_UPDATE_TEMPLATE,
  WHATSAPP_TEMPLATE_EXAMPLES,
  WHATSAPP_TEMPLATE_MAX_LENGTH,
  contentKey,
  renderTemplate,
  validateTemplate,
} from '@basketeasy/types/whatsapp-reminder';

describe('renderTemplate', () => {
  it('renders all four lines of the default for a match', () => {
    expect(renderTemplate(DEFAULT_REMINDER_TEMPLATE, WHATSAPP_TEMPLATE_EXAMPLES.MATCH)).toBe(
      [
        '🏀 Match contre ES Vertou, sam. 4 oct. !',
        'RDV 14:30 – Parking du club.',
        'On commence à 15:30 (Gymnase de la Durantière).',
        'Dis-nous si tu viens 👉 https://kluvo.fr/r/exemple?src=wa',
      ].join('\n'),
    );
  });

  it('drops the RDV line for a training', () => {
    const lines = renderTemplate(
      DEFAULT_REMINDER_TEMPLATE,
      WHATSAPP_TEMPLATE_EXAMPLES.TRAINING,
    ).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines.some((l) => l.includes('RDV'))).toBe(false);
  });

  it('drops the RDV line for a match without a meeting point', () => {
    const vars = { ...WHATSAPP_TEMPLATE_EXAMPLES.MATCH, meeting_time: null, meeting_place: null };
    expect(renderTemplate(DEFAULT_REMINDER_TEMPLATE, vars).split('\n')).toHaveLength(3);
  });

  it('replaces a repeated variable everywhere', () => {
    expect(
      renderTemplate('{team_name} / {team_name} {link}', WHATSAPP_TEMPLATE_EXAMPLES.MATCH),
    ).toBe('U15 F1 / U15 F1 https://kluvo.fr/r/exemple?src=wa');
  });
});

describe('validateTemplate', () => {
  it('accepts the default', () => {
    expect(validateTemplate(DEFAULT_REMINDER_TEMPLATE)).toEqual({ ok: true });
  });

  it('refuses a template without the link', () => {
    expect(validateTemplate('salut {team_name}')).toEqual({ ok: false, code: 'MISSING_LINK' });
  });

  it('does not take {link} inside another word as the link', () => {
    expect(validateTemplate('salut {linkage}')).toEqual({
      ok: false,
      code: 'UNKNOWN_VARIABLE',
      variable: 'linkage',
    });
    expect(validateTemplate('salut link')).toEqual({ ok: false, code: 'MISSING_LINK' });
  });

  it('refuses an unknown variable, naming it', () => {
    expect(validateTemplate('{link} {nope}')).toEqual({
      ok: false,
      code: 'UNKNOWN_VARIABLE',
      variable: 'nope',
    });
  });

  it('accepts 1000 characters and refuses 1001', () => {
    const base = '{link} ';
    expect(validateTemplate(base + 'a'.repeat(WHATSAPP_TEMPLATE_MAX_LENGTH - base.length))).toEqual(
      {
        ok: true,
      },
    );
    expect(
      validateTemplate(base + 'a'.repeat(WHATSAPP_TEMPLATE_MAX_LENGTH - base.length + 1)),
    ).toEqual({
      ok: false,
      code: 'TOO_LONG',
    });
  });

  it.each(['{opponent} {link}', 'RDV {meeting_time} {link}', '{link} {meeting_place}'])(
    'refuses the link on a droppable line: %s',
    (template) => {
      expect(validateTemplate(template)).toEqual({ ok: false, code: 'LINK_ON_DROPPABLE_LINE' });
    },
  );
});

describe('contentKey', () => {
  it('is stable across key order and blind to the link', () => {
    const vars = WHATSAPP_TEMPLATE_EXAMPLES.MATCH;
    const reordered = Object.fromEntries(Object.entries(vars).reverse()) as typeof vars;
    expect(contentKey(reordered)).toBe(contentKey(vars));
    expect(contentKey({ ...vars, link: 'https://other' })).toBe(contentKey(vars));
  });

  it('changes when a message variable changes', () => {
    const vars = WHATSAPP_TEMPLATE_EXAMPLES.MATCH;
    expect(contentKey({ ...vars, event_time: '16:00' })).not.toBe(contentKey(vars));
  });
});

describe('update and cancellation templates', () => {
  it('the default update reads like the reminder, with the RDV line dropped for a training', () => {
    const lines = renderTemplate(
      DEFAULT_UPDATE_TEMPLATE,
      WHATSAPP_TEMPLATE_EXAMPLES.TRAINING,
    ).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('Changement');
    expect(validateTemplate(DEFAULT_UPDATE_TEMPLATE, 'UPDATE')).toEqual({ ok: true });
  });

  it('renders the default cancellation as one line, with no link', () => {
    expect(
      renderTemplate(DEFAULT_CANCELLATION_TEMPLATE, {
        ...WHATSAPP_TEMPLATE_EXAMPLES.MATCH,
        link: null,
      }),
    ).toBe("❌ Match contre ES Vertou du sam. 4 oct. : c'est annulé. On te tient au courant !");
    expect(validateTemplate(DEFAULT_CANCELLATION_TEMPLATE, 'CANCELLATION')).toEqual({ ok: true });
  });

  it('a cancellation does not need the link, nor keep it off a droppable line', () => {
    expect(validateTemplate('Annulé', 'CANCELLATION')).toEqual({ ok: true });
    expect(validateTemplate('{opponent} {link}', 'CANCELLATION')).toEqual({ ok: true });
  });

  it('a cancellation still refuses an unknown variable and an over-long text', () => {
    expect(validateTemplate('Annulé {nope}', 'CANCELLATION')).toEqual({
      ok: false,
      code: 'UNKNOWN_VARIABLE',
      variable: 'nope',
    });
    expect(validateTemplate('a'.repeat(1001), 'CANCELLATION')).toEqual({
      ok: false,
      code: 'TOO_LONG',
    });
  });

  it('an update keeps the reminder’s link rules', () => {
    expect(validateTemplate('Changement', 'UPDATE')).toEqual({ ok: false, code: 'MISSING_LINK' });
    expect(validateTemplate('{meeting_time} {link}', 'UPDATE')).toEqual({
      ok: false,
      code: 'LINK_ON_DROPPABLE_LINE',
    });
  });
});
