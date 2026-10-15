import { createRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  TemplateEditor,
  parseTemplate,
  serializeTemplate,
  type TemplateEditorHandle,
  type TemplateEditorVariable,
} from './TemplateEditor';

const VARIABLES: TemplateEditorVariable[] = [
  { key: 'event_name', label: "Nom de l'événement" },
  { key: 'meeting_time', label: 'Heure de RDV' },
  { key: 'link', label: 'Lien de réponse' },
];

describe('parseTemplate / serializeTemplate', () => {
  it.each([
    ['plain text'],
    ['{event_name}'],
    ['a {event_name} b {meeting_time}\n\nlast line {link}'],
    ['line one\nline two'],
    [''],
  ])('round-trips %j', (text) => {
    expect(serializeTemplate(parseTemplate(text, VARIABLES))).toBe(text);
  });

  it('turns a known key into a chip and leaves an unknown one as text', () => {
    const doc = parseTemplate('{event_name} {nope}', VARIABLES);
    expect(doc.content?.[0].content).toEqual([
      { type: 'variable', attrs: { key: 'event_name' } },
      { type: 'text', text: ' {nope}' },
    ]);
  });
});

function Harness({
  onChange,
  initial = '',
  handle,
}: {
  onChange?: (v: string) => void;
  initial?: string;
  handle?: React.Ref<TemplateEditorHandle>;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <span id="lbl">Modèle</span>
      <TemplateEditor
        ref={handle}
        value={value}
        variables={VARIABLES}
        aria-labelledby="lbl"
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('TemplateEditor', () => {
  it('is a labelled multiline textbox showing variables by label', async () => {
    render(<Harness initial={'Salut {event_name}\n{link}'} />);

    const box = await screen.findByRole('textbox', { name: 'Modèle' });
    expect(box).toHaveAttribute('aria-multiline', 'true');
    expect(box).toHaveTextContent("Salut Nom de l'événement");
    expect(box).toHaveTextContent('Lien de réponse');
    expect(box).not.toHaveTextContent('{');
  });

  it('inserts a chip at the end when the editor never had focus, emitting {key} text', async () => {
    const handle = createRef<TemplateEditorHandle>();
    const onChange = vi.fn();
    render(<Harness initial="Salut " handle={handle} onChange={onChange} />);
    await screen.findByRole('textbox');

    act(() => handle.current?.insertVariable('meeting_time'));

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('Salut {meeting_time}'));
    expect(screen.getByRole('textbox')).toHaveTextContent('Heure de RDV');
  });

  it('pastes plain text only, keeping a pasted {link} as text', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const box = await screen.findByRole('textbox');

    fireEvent.paste(box, {
      clipboardData: {
        getData: (type: string) =>
          type === 'text/plain' ? 'ligne un\nRépondre {link}' : '<b>ignored</b>',
      },
    });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenLastCalledWith('ligne un\nRépondre {link}');
    expect(box.querySelector('[data-variable]')).toBeNull();
  });

  it('does not touch the document when re-rendered with the value it emitted', async () => {
    const handle = createRef<TemplateEditorHandle>();
    render(<Harness initial="abc" handle={handle} />);
    const box = await screen.findByRole('textbox');
    const paragraph = box.querySelector('p');

    act(() => handle.current?.insertVariable('link'));
    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('abc{link}'));

    expect(box.querySelector('p')).toBe(paragraph);
  });

  it('follows an outside change of the value', async () => {
    const { rerender } = render(
      <TemplateEditor value="un" variables={VARIABLES} onChange={() => {}} />,
    );
    expect(await screen.findByRole('textbox')).toHaveTextContent('un');

    rerender(<TemplateEditor value="deux {link}" variables={VARIABLES} onChange={() => {}} />);

    await waitFor(() =>
      expect(screen.getByRole('textbox')).toHaveTextContent('deux Lien de réponse'),
    );
  });
});
