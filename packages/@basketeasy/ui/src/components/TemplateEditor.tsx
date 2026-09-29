import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Document } from '@tiptap/extension-document';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { UndoRedo } from '@tiptap/extensions';
import { Node, mergeAttributes, type JSONContent } from '@tiptap/core';
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type NodeViewProps,
} from '@tiptap/react';
import { cn } from '../lib/cn';
import { focusRing } from '../lib/focusRing';
import { Badge } from './Badge';

/**
 * The one door to the rich-text library (Tiptap / ProseMirror). Nothing else
 * imports `@tiptap/*`, the way `Chart` is the only importer of `recharts`: a
 * call site passes and receives plain `{key}` text and never sees editor JSON,
 * so a later swap touches this file only.
 *
 * The model is one paragraph per line, text, and an inline atom `variable`
 * node rendered as a labelled chip. The atom flag gives whole-chip selection
 * and deletion for free. Bold, lists and headings are deliberately absent: they
 * mean nothing in a WhatsApp message.
 */

export interface TemplateEditorVariable {
  key: string;
  label: string;
}

export interface TemplateEditorHandle {
  /** At the selection, or at the end when the editor never had focus. */
  insertVariable: (key: string) => void;
}

export interface TemplateEditorProps {
  /** Plain text with `{key}` tokens. */
  value: string;
  onChange: (value: string) => void;
  variables: TemplateEditorVariable[];
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  className?: string;
}

const TOKEN = /\{([^{}\n]*)\}/g;

/** `{key}` text to editor JSON: a known key becomes a chip, anything else stays text. */
export function parseTemplate(text: string, variables: TemplateEditorVariable[]): JSONContent {
  const known = new Set(variables.map((v) => v.key));
  return {
    type: 'doc',
    content: text.split('\n').map((line) => {
      const content: JSONContent[] = [];
      let last = 0;
      const push = (chunk: string) => {
        if (chunk) content.push({ type: 'text', text: chunk });
      };
      for (const match of line.matchAll(TOKEN)) {
        if (!known.has(match[1])) continue;
        push(line.slice(last, match.index));
        content.push({ type: 'variable', attrs: { key: match[1] } });
        last = match.index + match[0].length;
      }
      push(line.slice(last));
      return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
    }),
  };
}

/** Editor JSON back to `{key}` text: paragraphs joined by a newline. */
export function serializeTemplate(doc: JSONContent): string {
  return (doc.content ?? [])
    .map((paragraph) =>
      (paragraph.content ?? [])
        .map((node) => (node.type === 'variable' ? `{${node.attrs?.key}}` : (node.text ?? '')))
        .join(''),
    )
    .join('\n');
}

function VariableChip({ node, extension }: NodeViewProps) {
  const labels = extension.options.labels as Record<string, string>;
  return (
    <NodeViewWrapper as="span" className="mx-0.5 inline-block align-baseline">
      <Badge variant="soft" tone="structure" contentEditable={false}>
        {labels[node.attrs.key] ?? node.attrs.key}
      </Badge>
    </NodeViewWrapper>
  );
}

const Variable = Node.create<{ labels: Record<string, string> }>({
  name: 'variable',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addOptions: () => ({ labels: {} }),
  addAttributes: () => ({ key: { default: '' } }),
  parseHTML: () => [{ tag: 'span[data-variable]' }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'span',
    mergeAttributes(HTMLAttributes, { 'data-variable': node.attrs.key }),
  ],
  addNodeView: () => ReactNodeViewRenderer(VariableChip),
});

// A paste is text and nothing else: a `{link}` pasted in stays the characters
// it is, and refused by validation like any typed token.
function pastedContent(text: string): JSONContent[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const asText = (line: string): JSONContent[] => (line ? [{ type: 'text', text: line }] : []);
  if (lines.length === 1) return asText(lines[0]);
  return lines.map((line) =>
    line ? { type: 'paragraph', content: asText(line) } : { type: 'paragraph' },
  );
}

export const TemplateEditor = forwardRef<TemplateEditorHandle, TemplateEditorProps>(
  function TemplateEditor(
    {
      value,
      onChange,
      variables,
      className,
      'aria-labelledby': labelledBy,
      'aria-describedby': describedBy,
    },
    ref,
  ) {
    const hasHadFocus = useRef(false);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const variablesRef = useRef(variables);
    variablesRef.current = variables;

    const editor = useEditor({
      extensions: [
        Document,
        Paragraph,
        Text,
        UndoRedo,
        Variable.configure({
          labels: Object.fromEntries(variables.map((v) => [v.key, v.label])),
        }),
      ],
      content: parseTemplate(value, variables),
      editorProps: {
        attributes: {
          role: 'textbox',
          'aria-multiline': 'true',
          ...(labelledBy ? { 'aria-labelledby': labelledBy } : {}),
          ...(describedBy ? { 'aria-describedby': describedBy } : {}),
          class: cn(
            'min-h-24 rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-base text-charcoal md:text-sm',
            focusRing,
            className,
          ),
        },
        handlePaste: (_view, event) => {
          const text = event.clipboardData?.getData('text/plain');
          if (text === undefined || text === '') return true;
          editor?.chain().insertContent(pastedContent(text)).run();
          return true;
        },
      },
      onFocus: () => {
        hasHadFocus.current = true;
      },
      onUpdate: ({ editor: current }) => {
        const next = serializeTemplate(current.getJSON());
        onChangeRef.current(next);
      },
    });

    // Compared before setContent so typing never resets the caret. Deferred to
    // a microtask because Tiptap's React node views flushSync while updating,
    // which React refuses to do from inside an effect.
    useEffect(() => {
      if (!editor || value === serializeTemplate(editor.getJSON())) return;
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled || editor.isDestroyed) return;
        if (value === serializeTemplate(editor.getJSON())) return;
        editor.commands.setContent(parseTemplate(value, variablesRef.current), {
          emitUpdate: false,
        });
      });
      return () => {
        cancelled = true;
      };
    }, [editor, value]);

    useImperativeHandle(
      ref,
      () => ({
        insertVariable: (key) => {
          if (!editor) return;
          const chain = hasHadFocus.current ? editor.chain().focus() : editor.chain().focus('end');
          chain.insertContent({ type: 'variable', attrs: { key } }).run();
        },
      }),
      [editor],
    );

    return <EditorContent editor={editor} />;
  },
);
