// A QR code's error-correction select, driven through PropertyPanel over a REAL
// editor: where it sits, which items get it, how each authored shape reads, what
// a pick writes and undoes, and the picks that must write nothing.

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { en } from '../i18n/catalog/en';
import { I18nProvider } from '../i18n/context';
import { PropertyPanel } from './PropertyPanel';

const item = (i: number) => `sections.body.items[${i}]`;
const [ABSENT, HIGH, MEDIUM, REFUSED, LIST, MAP, EMPTY, BOOL, TEXT, GRID] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
].map(item);

const SOURCE = `sections:
  body:
    type: flow
    items:
      - { type: qr_code, box: { w: 60, h: 60 }, text: https://example.com }
      - { type: qr_code, box: { w: 60, h: 60 }, text: https://example.com, errorCorrection: high }
      - { type: qr_code, box: { w: 60, h: 60 }, text: https://example.com, errorCorrection: medium }
      - { type: qr_code, box: { w: 60, h: 60 }, text: https://example.com, errorCorrection: LOW }
      - { type: qr_code, box: { w: 60, h: 60 }, text: https://example.com, errorCorrection: [high] }
      - { type: qr_code, box: { w: 60, h: 60 }, text: https://example.com, errorCorrection: { a: 1 } }
      - { type: qr_code, box: { w: 60, h: 60 }, text: https://example.com, errorCorrection: "" }
      - { type: qr_code, box: { w: 60, h: 60 }, text: https://example.com, errorCorrection: true }
      - { type: text, text: hello }
      - type: char_grid
        data: { key: manuscript }
        grid: { charsPerLine: 20, lines: 10 }
`;

/** A QR code ITEM inside a column's free-layout cell — an ordinary item there. */
const CELL_SOURCE = `sections:
  body:
    type: flow
    items:
      - type: table
        data: { key: rows }
        columns:
          - label: Code
            cell:
              items:
                - { type: qr_code, box: { x: 0, y: 0, w: 40, h: 40 }, data: { key: u } }
`;
const CELL_QR = 'sections.body.items[0].columns[0].cell.items[0]';

function Harness({ path, source = SOURCE }: { readonly path: string; readonly source?: string }) {
  const editor = useEditor(source);
  return (
    <I18nProvider locale="en">
      <PropertyPanel controller={editor} path={path} />
      <pre data-testid="doc">{editor.text}</pre>
      <output data-testid="revision">{editor.revision}</output>
      <button type="button" onClick={editor.undo}>
        undo
      </button>
    </I18nProvider>
  );
}

const LABEL = 'Error correction';
const select = () => screen.getByLabelText(LABEL) as HTMLSelectElement;
const doc = () => screen.getByTestId('doc').textContent ?? '';
const revision = () => screen.getByTestId('revision').textContent;
/** The line of the item at `index` in the flow-style fixture, as serialized. */
const line = (index: number) => doc().split('\n')[4 + index];
const pick = (value: string) => fireEvent.change(select(), { target: { value } });

describe('QrErrorCorrectionField', () => {
  it('sits in the content section, under the content fields', () => {
    render(<Harness path={ABSENT} />);
    const section = select().closest('section');
    expect(section).not.toBeNull();
    const controls = within(section as HTMLElement).getAllByRole('combobox');
    // The content-source select comes first; the level is the section's last.
    expect(controls.at(-1)).toBe(select());
    expect(controls.indexOf(select())).toBeGreaterThan(0);
  });

  it('offers the default row and the four levels, in the engine’s order', () => {
    render(<Harness path={ABSENT} />);
    expect([...select().options].map((o) => [o.value, o.textContent])).toEqual([
      ['', '(Default: M, medium)'],
      ['low', 'L: low (about 7%)'],
      ['medium', 'M: medium (about 15%)'],
      ['quartile', 'Q: quartile (about 25%)'],
      ['high', 'H: high (about 30%)'],
    ]);
    expect(select().value).toBe('');
  });

  it('is offered on a QR code and on no other content-tab item', () => {
    for (const path of [TEXT, GRID]) {
      const { unmount } = render(<Harness path={path} />);
      expect(screen.queryByLabelText(LABEL)).toBeNull();
      unmount();
    }
  });

  it('reads an explicit medium apart from an unset level', () => {
    const { unmount } = render(<Harness path={MEDIUM} />);
    expect(select().value).toBe('medium');
    unmount();
    render(<Harness path={ABSENT} />);
    expect(select().value).toBe('');
  });

  it('shows a spelling the engine refuses as itself, marked invalid', () => {
    render(<Harness path={REFUSED} />);
    expect(select().value).toBe('LOW');
    expect(select().selectedOptions[0].textContent).toBe('LOW (invalid value)');
  });

  it('writes the picked level at the item’s top level, and one undo removes it', () => {
    render(<Harness path={ABSENT} />);
    const before = doc();
    const rev = Number(revision());
    pick('high');
    expect(line(0)).toBe(
      '      - { type: qr_code, box: { w: 60, h: 60 }, text: https://example.com, errorCorrection: high }',
    );
    expect(doc()).not.toContain('style');
    expect(Number(revision())).toBe(rev + 1);
    fireEvent.click(screen.getByRole('button', { name: 'undo' }));
    expect(doc()).toBe(before);
  });

  it('removes the key when the default row is picked', () => {
    render(<Harness path={HIGH} />);
    pick('');
    expect(line(1)).toBe(
      '      - { type: qr_code, box: { w: 60, h: 60 }, text: https://example.com }',
    );
  });

  it('writes nothing when the shown level is picked again', () => {
    render(<Harness path={HIGH} />);
    const before = doc();
    const rev = revision();
    pick('high');
    expect(revision()).toBe(rev);
    expect(doc()).toBe(before);
  });

  it.each([
    // The empty string keeps its quotes once overwritten — `"low"` is a string the
    // engine reads like `low`.
    ['a list', LIST, 4, 'low'],
    ['a map', MAP, 5, 'low'],
    ['an empty string', EMPTY, 6, '"low"'],
    ['a boolean', BOOL, 7, 'low'],
  ])(
    'marks an unreadable level (%s) invalid, and a pick replaces it',
    (_, path, index, written) => {
      render(<Harness path={path} />);
      expect(select().selectedOptions[0].textContent).toBe('(invalid value)');
      pick('low');
      expect(line(index)).toBe(
        `      - { type: qr_code, box: { w: 60, h: 60 }, text: https://example.com, errorCorrection: ${written} }`,
      );
    },
  );

  it.each([
    ['a list', LIST, 4],
    ['an empty string', EMPTY, 6],
    ['a misspelt level', REFUSED, 3],
  ])('removes an invalid level (%s) when the default row is picked', (_, path, index) => {
    render(<Harness path={path} />);
    pick('');
    expect(line(index)).toBe(
      '      - { type: qr_code, box: { w: 60, h: 60 }, text: https://example.com }',
    );
  });

  it('offers the field on a QR code inside a column’s free-layout cell', () => {
    render(<Harness path={CELL_QR} source={CELL_SOURCE} />);
    pick('high');
    expect(doc()).toContain(
      '- { type: qr_code, box: { x: 0, y: 0, w: 40, h: 40 }, data: { key: u }, errorCorrection: high }',
    );
  });

  it('explains the level behind its ?', () => {
    render(<Harness path={ABSENT} />);
    fireEvent.click(screen.getByRole('button', { name: 'How much damage it survives' }));
    expect(screen.getByText(en.chrome['help.errorCorrection.body'])).toBeTruthy();
  });
});
