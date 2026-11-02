// The named-style form's 「その他の設定」, reached the way an author reaches it
// (the styles section's row, then the form), over a real editor: the
// disclosure is closed and counts what the style sets; its edits stay in the
// draft until 保存, which writes them with the rows' edits as ONE undo step,
// changed keys only; a per-side border map stays read-only and byte-intact;
// a create authors a listed key; the engine's capabilities decide which keys
// are listed.

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { buildStyleUsage } from '../styles/usage';
import { StylesManager } from './StylesManager';

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
      <StylesManager
        controller={editor}
        capabilities={capabilities}
        usage={buildStyleUsage(editor.text)}
      />
      <pre data-testid="doc">{editor.text}</pre>
      <button type="button" data-testid="undo" onClick={editor.undo}>
        undo
      </button>
    </I18nProvider>
  );
}

function source(...style: string[]): string {
  return [
    'styles:',
    '  s:',
    '    # a comment the form must keep',
    '    fontSize: 9',
    ...style.map((line) => `    ${line}`),
    'sections:',
    '  body:',
    '    type: flow',
    '    items: []',
    '',
  ].join('\n');
}

const doc = () => screen.getByTestId('doc').textContent ?? '';

/** Open the edit form of the one style, and return the dialog. */
function openForm(): HTMLElement {
  const row = screen.getAllByRole('listitem')[0];
  const face = within(row)
    .getAllByRole('button')
    .filter((el) => el.getAttribute('aria-haspopup') === null)[0];
  fireEvent.click(face);
  return screen.getByRole('dialog');
}

const save = (dialog: HTMLElement) =>
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

describe('the named-style form’s More settings', () => {
  it('sits closed under the rows, counting the listed keys the style sets', () => {
    const src = source('lineBreak: strict', 'opacity: 0.5', 'textAlign: center');
    render(<Harness source={src} />);
    const dialog = openForm();
    const toggle = within(dialog).getByRole('button', { name: 'More settings (2 set)' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    // Under the rows, above the preview.
    const fontSize = within(dialog).getByLabelText('Font size');
    const preview = within(dialog).getByText('Preview');
    expect(
      fontSize.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(toggle.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Opening and closing, then saving untouched, authors nothing.
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    save(dialog);
    expect(doc()).toBe(src);
  });

  it('lists the sixteen keys no row edits, in their groups, as blank fields', () => {
    render(<Harness source={source()} />);
    const dialog = openForm();
    fireEvent.click(within(dialog).getByRole('button', { name: 'More settings' }));
    for (const label of ['Letter spacing', 'Line-break rules', 'Opacity', 'Border color']) {
      expect(within(dialog).getByLabelText(label)).toBeTruthy();
    }
    expect((within(dialog).getByLabelText('Letter spacing') as HTMLInputElement).value).toBe('');
    expect(within(dialog).getByText('Border')).toBeTruthy();
  });

  it('keeps its edits in the draft until Save, then writes them with the rows’ as one undo step', () => {
    const src = source('lineBreak: normal', 'opacity: 0.5');
    render(<Harness source={src} />);
    const dialog = openForm();
    fireEvent.click(within(dialog).getByRole('button', { name: 'More settings (2 set)' }));
    fireEvent.change(within(dialog).getByLabelText('Line-break rules'), {
      target: { value: 'loose' },
    });
    fireEvent.blur(within(dialog).getByLabelText('Opacity'), { target: { value: '' } });
    fireEvent.blur(within(dialog).getByLabelText('Letter spacing'), { target: { value: '1' } });
    fireEvent.blur(within(dialog).getByLabelText('Font size'), { target: { value: '10' } });
    expect(doc()).toBe(src);
    save(dialog);
    expect(doc()).toBe(
      source('lineBreak: loose', 'letterSpacing: 1').replace('fontSize: 9', 'fontSize: 10'),
    );
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).toBe(src);
  });

  it('writes nothing for a key edited back to its saved value', () => {
    const src = source('lineBreak: strict');
    render(<Harness source={src} />);
    const dialog = openForm();
    fireEvent.click(within(dialog).getByRole('button', { name: 'More settings (1 set)' }));
    const select = within(dialog).getByLabelText('Line-break rules');
    fireEvent.change(select, { target: { value: 'loose' } });
    fireEvent.change(select, { target: { value: 'strict' } });
    save(dialog);
    expect(doc()).toBe(src);
  });

  it('shows a per-side border map read-only and keeps it through an edit of another key', () => {
    const src = source('borderColor:', '  top: "#ff0000"');
    render(<Harness source={src} />);
    const dialog = openForm();
    fireEvent.click(within(dialog).getByRole('button', { name: 'More settings (1 set)' }));
    expect(
      within(dialog).getByText("Each side has its own border. This can't be changed here."),
    ).toBeTruthy();
    expect(within(dialog).queryByLabelText('Border color')).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Line-break rules'), {
      target: { value: 'loose' },
    });
    save(dialog);
    expect(doc()).toBe(source('borderColor:', '  top: "#ff0000"', 'lineBreak: loose'));
  });

  it('authors a listed key on a create, in the create’s one undo step', () => {
    const src = source();
    render(<Harness source={src} />);
    fireEvent.click(screen.getByRole('button', { name: 'New style' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Style name'), { target: { value: 'airy' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'More settings' }));
    fireEvent.change(within(dialog).getByLabelText('Line-break rules'), {
      target: { value: 'loose' },
    });
    // A key set and then cleared again is not authored.
    fireEvent.blur(within(dialog).getByLabelText('Letter spacing'), { target: { value: '1' } });
    fireEvent.blur(within(dialog).getByLabelText('Letter spacing'), { target: { value: '' } });
    save(dialog);
    expect(doc()).toContain('  airy:\n    lineBreak: loose\n');
    expect(doc()).not.toContain('letterSpacing');
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).toBe(src);
  });

  it('lists only the keys the engine reports a capability for', () => {
    render(<Harness source={source()} capabilities={['style.lineBreak']} />);
    const dialog = openForm();
    fireEvent.click(within(dialog).getByRole('button', { name: 'More settings' }));
    expect(within(dialog).getByLabelText('Line-break rules')).toBeTruthy();
    expect(within(dialog).queryByLabelText('Letter spacing')).toBeNull();
  });

  it('draws no disclosure for an engine that reports none of the listed keys', () => {
    render(<Harness source={source()} capabilities={[]} />);
    const dialog = openForm();
    expect(within(dialog).queryByRole('button', { name: /More settings/ })).toBeNull();
  });
});
