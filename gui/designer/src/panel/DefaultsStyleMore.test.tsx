// The 標準テキスト section's 「その他の設定」 over a real editor: closed under
// the rows and above the size hint, counting what `defaults.style` sets; each
// unset field names the engine's initial value; an edit writes exactly its key
// under `defaults.style` at once, clearing removes it, undo returns the bytes;
// the engine's capabilities decide which keys are listed.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { DocumentDefaults } from './DocumentDefaults';

function Harness({
  source,
  capabilities,
}: {
  readonly source: string;
  readonly capabilities?: readonly string[];
}) {
  const editor = useEditor(source);
  return (
    <I18nProvider locale="en">
      <DocumentDefaults controller={editor} capabilities={capabilities} section="style" />
      <button type="button" onClick={editor.undo}>
        undo
      </button>
      <pre data-testid="doc">{editor.text}</pre>
    </I18nProvider>
  );
}

const BODY = ['sections:', '  body:', '    type: flow', '    items: []', ''];

function source(...style: string[]): string {
  const defaults =
    style.length === 0
      ? []
      : [
          'defaults:',
          '  style:',
          '    # a comment the section must keep',
          ...style.map((l) => `    ${l}`),
        ];
  return [...defaults, ...BODY].join('\n');
}

const doc = () => screen.getByTestId('doc').textContent ?? '';

const open = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('the defaults.style More settings', () => {
  it('sits closed between the rows and the size hint, counting what is set', () => {
    const src = source('lineBreak: strict', 'fontSize: 12');
    render(<Harness source={src} />);
    const toggle = screen.getByRole('button', { name: 'More settings (1 set)' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const color = screen.getByText('Color');
    const hint = screen.getByText(/Body text usually reads best/);
    expect(color.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toggle.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Opening and closing authors nothing.
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(doc()).toBe(src);
  });

  it('lists the seven keys no row edits, each unset one naming its initial value', () => {
    render(<Harness source={source()} />);
    open('More settings');
    for (const label of [
      'Letter spacing',
      'Line-break rules',
      'Punctuation spacing',
      'Writing direction',
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.queryByLabelText('Opacity')).toBeNull();
    expect((screen.getByLabelText('Letter spacing') as HTMLInputElement).placeholder).toBe('0');
    const lineBreak = screen.getByLabelText('Line-break rules') as HTMLSelectElement;
    expect(lineBreak.options[0].textContent).toMatch(/^Not set \(/);
  });

  it('writes exactly the edited key at once, removes it when cleared, and undoes', () => {
    const src = source('fontSize: 12');
    render(<Harness source={src} />);
    open('More settings');
    fireEvent.blur(screen.getByLabelText('Letter spacing'), { target: { value: '0.5' } });
    expect(doc()).toBe(source('fontSize: 12', 'letterSpacing: 0.5'));
    // A blur over the same value writes nothing.
    fireEvent.blur(screen.getByLabelText('Letter spacing'), { target: { value: '0.5' } });
    expect(doc()).toBe(source('fontSize: 12', 'letterSpacing: 0.5'));
    fireEvent.blur(screen.getByLabelText('Letter spacing'), { target: { value: '' } });
    expect(doc()).toBe(src);
    fireEvent.click(screen.getByText('undo'));
    expect(doc()).toBe(source('fontSize: 12', 'letterSpacing: 0.5'));
  });

  it('authors the key into a document with no defaults yet', () => {
    render(<Harness source={source()} />);
    open('More settings');
    fireEvent.change(screen.getByLabelText('Line-break rules'), { target: { value: 'loose' } });
    expect(doc()).toContain('defaults:\n  style:\n    lineBreak: loose\n');
    fireEvent.click(screen.getByText('undo'));
    expect(doc()).toBe(source());
  });

  it('lists only the keys the engine reports a capability for', () => {
    render(<Harness source={source()} capabilities={['template.defaults', 'style.lineBreak']} />);
    open('More settings');
    expect(screen.getByLabelText('Line-break rules')).toBeTruthy();
    expect(screen.queryByLabelText('Letter spacing')).toBeNull();
  });

  it('draws no disclosure for an engine that reports none of the listed keys', () => {
    render(<Harness source={source()} capabilities={['template.defaults']} />);
    expect(screen.queryByRole('button', { name: /More settings/ })).toBeNull();
  });
});
