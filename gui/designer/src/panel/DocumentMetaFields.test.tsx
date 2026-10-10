import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { LOCALES } from '../i18n/locales';
import { DocumentMetaFields } from './DocumentMetaFields';

/** A real-editor harness: applying an op mutates the document and re-renders,
 * so tests assert the serialized doc, not a spy. */
function Harness({
  source,
  metadata = true,
}: {
  readonly source: string;
  readonly metadata?: boolean;
}) {
  const editor = useEditor(source);
  return (
    <I18nProvider locale="en">
      <DocumentMetaFields controller={editor} metadata={metadata} />
      <pre data-testid="doc">{editor.text}</pre>
      <output data-testid="revision">{editor.revision}</output>
      <output data-testid="can-undo">{String(editor.canUndo)}</output>
    </I18nProvider>
  );
}

const BASE = 'sections:\n  body:\n    type: flow\n    items: []\n';

function doc(): string {
  return screen.getByTestId('doc').textContent ?? '';
}

function revision(): string {
  return screen.getByTestId('revision').textContent ?? '';
}

function input(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

/** `a` comes before `b` in document order. */
function precedes(a: Node, b: Node): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/** The rows of one list field, in order (each is an `<input>` labelled by the
 * field's own label element). */
function rows(label: string): HTMLInputElement[] {
  return screen.getAllByLabelText(label) as HTMLInputElement[];
}

describe('DocumentMetaFields', () => {
  it('renders the authored metadata and says where it goes', () => {
    render(
      <Harness
        source={`document:\n  title: Invoice\n  description: January\n  language: ja-JP\n  keywords: [a, b]\n  authors: [Acct]\n${BASE}`}
      />,
    );
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Invoice');
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('January');
    expect((screen.getByLabelText('Language') as HTMLInputElement).value).toBe('ja-JP');
    // Two authored keywords plus the trailing blank row that adds.
    expect(rows('Keywords').map((input) => input.value)).toEqual(['a', 'b', '']);
    expect(rows('Authors').map((input) => input.value)).toEqual(['Acct', '']);
    // The section is explicit that none of this shows on the page.
    expect(screen.getByText(/not onto the page/i)).toBeTruthy();
  });

  it('offers the known locale tags for the language rather than free typing alone', () => {
    render(<Harness source={BASE} />);
    const options = Array.from(document.querySelectorAll('#sj-document-language option'), (o) =>
      o.getAttribute('value'),
    );
    expect(options).toEqual(LOCALES.map((l) => l.tag));
  });

  it('writes each scalar field and clears it on an empty commit', () => {
    render(<Harness source={BASE} />);
    fireEvent.blur(screen.getByLabelText('Title'), { target: { value: 'Receipt' } });
    expect(doc()).toContain('title: Receipt');
    fireEvent.blur(screen.getByLabelText('Description'), { target: { value: 'A receipt' } });
    expect(doc()).toContain('description: A receipt');
    fireEvent.blur(screen.getByLabelText('Language'), { target: { value: 'en-US' } });
    expect(doc()).toContain('language: en-US');
    fireEvent.blur(screen.getByLabelText('Title'), { target: { value: '' } });
    expect(doc()).not.toContain('title:');
  });

  it('adds a list entry through the trailing blank row', () => {
    render(<Harness source={BASE} />);
    const blank = rows('Keywords')[0];
    fireEvent.blur(blank, { target: { value: 'invoice' } });
    expect(doc()).toContain('keywords: [ invoice ]');
    fireEvent.blur(rows('Keywords')[1], { target: { value: 'billing' } });
    expect(doc()).toContain('keywords: [ invoice, billing ]');
  });

  it('edits and removes a list entry, dropping the key with the last one', () => {
    render(<Harness source={`document:\n  authors: [A, B]\n${BASE}`} />);
    fireEvent.blur(rows('Authors')[0], { target: { value: 'Accounting' } });
    expect(doc()).toContain('authors: [ Accounting, B ]');
    // Each authored row carries a remove button; the blank row does not, and
    // the empty keywords list contributes only its blank row.
    const removes = screen.getAllByLabelText('Remove');
    expect(removes).toHaveLength(2);
    fireEvent.click(removes[1]);
    expect(doc()).toContain('authors: [ Accounting ]');
    fireEvent.click(screen.getAllByLabelText('Remove')[0]);
    expect(doc()).not.toContain('authors:');
  });

  it('emptying a row removes that entry', () => {
    render(<Harness source={`document:\n  keywords: [a, b]\n${BASE}`} />);
    fireEvent.blur(rows('Keywords')[0], { target: { value: '' } });
    expect(doc()).toContain('keywords: [ b ]');
  });

  it('does not dispatch when a row blurs unchanged', () => {
    render(<Harness source={`document:\n  keywords: [a]\n${BASE}`} />);
    const before = doc();
    fireEvent.blur(rows('Keywords')[0], { target: { value: 'a' } });
    fireEvent.blur(rows('Keywords')[1], { target: { value: '' } });
    expect(doc()).toBe(before);
  });

  it('commits a row on Enter but never mid-IME-composition', () => {
    render(<Harness source={BASE} />);
    const blank = rows('Keywords')[0];
    blank.focus();
    fireEvent.change(blank, { target: { value: 'にほんご' } });
    // Confirming a Japanese conversion must not commit a half-typed entry.
    fireEvent.keyDown(blank, { key: 'Enter', isComposing: true });
    expect(doc()).not.toContain('keywords');
    // A plain Enter blurs, and the one blur handler is the sole commit path.
    fireEvent.keyDown(blank, { key: 'Enter' });
    expect(doc()).toContain('keywords: [ にほんご ]');
  });

  it('leads with the template name and version, above the title and its intro', () => {
    render(<Harness source={`name: receipt_ja\nversion: 0.1.0\n${BASE}`} />);
    expect(input('Template name').value).toBe('receipt_ja');
    expect(input('Template version').value).toBe('0.1.0');
    // The title's placeholder points at the name, so the name sits above it;
    // the intro ("these go into the PDF's properties") is untrue of the
    // version, so it heads the document half rather than the section.
    const intro = screen.getByText(/not onto the page/i);
    expect(precedes(input('Template name'), input('Template version'))).toBe(true);
    expect(precedes(input('Template version'), intro)).toBe(true);
    expect(precedes(intro, input('Title'))).toBe(true);
    // The hint names the Title field through the field's own label.
    expect(screen.getByText(/Used as the PDF's title .* when Title is empty\./)).toBeTruthy();
    expect(screen.getByText(/not written into the PDF/)).toBeTruthy();
  });

  it('shows a numeric version as its decimal string and an unreadable name as such', () => {
    render(<Harness source={`name: { not: text }\nversion: 1.5\n${BASE}`} />);
    expect(input('Template version').value).toBe('1.5');
    expect(input('Template name').value).toBe('');
    expect(input('Template name').placeholder).toBe('Unreadable value');
    // An absent key is not unreadable: no placeholder claims otherwise.
    expect(input('Template version').placeholder).toBe('');
  });

  it('clears an unreadable value with an empty commit, the one way to remove it', () => {
    render(<Harness source={`name: [a, b]\n${BASE}`} />);
    fireEvent.blur(input('Template name'), { target: { value: '' } });
    expect(doc()).not.toContain('name:');
  });

  it('replaces an unreadable value with typed text', () => {
    render(<Harness source={`version: { major: 1 }\n${BASE}`} />);
    fireEvent.blur(input('Template version'), { target: { value: '1.0' } });
    expect(doc()).toMatch(/^version: "1\.0"$/m);
  });

  it('writes the name and version at the root, the version as a string, and clears on empty', () => {
    render(<Harness source={BASE} />);
    fireEvent.blur(input('Template name'), { target: { value: 'invoice_ja' } });
    expect(doc()).toMatch(/^name: invoice_ja$/m);
    fireEvent.blur(input('Template version'), { target: { value: '2' } });
    // A string, not the number 2: text keeps exactly what was typed (a
    // number would turn `1.10` into `1.1`).
    expect(doc()).toMatch(/^version: "2"$/m);
    fireEvent.blur(input('Template version'), { target: { value: '' } });
    expect(doc()).not.toContain('version:');
    fireEvent.blur(input('Template name'), { target: { value: '' } });
    expect(doc()).not.toContain('name:');
  });

  it('adds no undo step when a field blurs at its own value', () => {
    render(
      <Harness
        source={`name: r\nversion: 1.5\ndocument:\n  title: T\n  description: D\n  language: ja-JP\n${BASE}`}
      />,
    );
    const before = revision();
    fireEvent.blur(input('Template name'), { target: { value: 'r' } });
    fireEvent.blur(input('Template version'), { target: { value: '1.5' } });
    fireEvent.blur(input('Title'), { target: { value: 'T' } });
    fireEvent.blur(input('Description'), { target: { value: 'D' } });
    fireEvent.blur(input('Language'), { target: { value: 'ja-JP' } });
    expect(revision()).toBe(before);
    expect(screen.getByTestId('can-undo').textContent).toBe('false');
  });

  it('offers only the name and version where the engine has no document metadata', () => {
    render(<Harness source={BASE} metadata={false} />);
    expect(input('Template name')).toBeTruthy();
    expect(input('Template version')).toBeTruthy();
    expect(screen.queryByLabelText('Title')).toBeNull();
    expect(screen.queryByText(/not onto the page/i)).toBeNull();
  });

  it('leaves other keys alone when it writes', () => {
    // The adoption gate: only touched keys change.
    render(<Harness source={`name: receipt\ndocument:\n  title: A\n${BASE}`} />);
    fireEvent.blur(screen.getByLabelText('Description'), { target: { value: 'D' } });
    const text = doc();
    expect(text).toContain('name: receipt');
    expect(text).toContain('title: A');
    expect(text).toContain('description: D');
  });
});
