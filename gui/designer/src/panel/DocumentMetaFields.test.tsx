import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { LOCALES } from '../i18n/locales';
import { DocumentMetaFields } from './DocumentMetaFields';

/** A real-editor harness: applying an op mutates the document and re-renders,
 * so tests assert the serialized doc, not a spy. */
function Harness({ source }: { readonly source: string }) {
  const editor = useEditor(source);
  return (
    <I18nProvider locale="en">
      <DocumentMetaFields controller={editor} />
      <pre data-testid="doc">{editor.text}</pre>
    </I18nProvider>
  );
}

const BASE = 'sections:\n  body:\n    type: flow\n    items: []\n';

function doc(): string {
  return screen.getByTestId('doc').textContent ?? '';
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
