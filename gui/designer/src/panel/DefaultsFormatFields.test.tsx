import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { FORMAT_CATALOG, fakeProbe } from '../testkit/formatCatalog';
import { DefaultsFormatFields } from './DefaultsFormatFields';

/** A real-editor harness: an op mutates the document and re-renders, so the
 * tests assert the serialized document rather than a spy. */
function Harness({
  source,
  withCatalog = true,
}: {
  readonly source: string;
  readonly withCatalog?: boolean;
}) {
  const editor = useEditor(source);
  return (
    <I18nProvider locale="en">
      <DefaultsFormatFields
        controller={editor}
        catalog={withCatalog ? FORMAT_CATALOG : null}
        probe={fakeProbe()}
      />
      <pre data-testid="doc">{editor.text}</pre>
      <button type="button" data-testid="undo" onClick={editor.undo}>
        undo
      </button>
    </I18nProvider>
  );
}

const BARE = 'sections:\n  body: { type: absolute }\n';
const doc = () => screen.getByTestId('doc').textContent ?? '';
const openPicker = (type: string) =>
  fireEvent.click(screen.getByRole('button', { name: `Choose the ${type} format` }));

describe('DefaultsFormatFields', () => {
  it('shows a row per type, unset ones reading as the locale default with its sample', () => {
    render(<Harness source={BARE} />);
    expect(screen.getAllByText('Locale default')).toHaveLength(6);
    expect(screen.getByText('2026年11月3日')).toBeTruthy();
    // The plural-aware type shows BOTH arms — one exemplar cannot.
    expect(screen.getByText('1点 / 12,345点')).toBeTruthy();
  });

  it('offers a picker ONLY where the engine says the type has a choice', () => {
    render(<Harness source={BARE} />);
    // date / datetime / currency have named variants; the other three do not,
    // and a control that can only produce a warning is worse than none.
    for (const type of ['Date', 'Date & time', 'Currency']) {
      expect(screen.getByRole('button', { name: `Choose the ${type} format` })).toBeTruthy();
    }
    for (const type of ['Number', 'Percentage', 'Quantity']) {
      expect(screen.queryByRole('button', { name: `Choose the ${type} format` })).toBeNull();
    }
  });

  it('falls back to a control on EVERY row when the engine did not answer', () => {
    render(<Harness source={BARE} withCatalog={false} />);
    expect(screen.getByRole('button', { name: 'Choose the Number format' })).toBeTruthy();
  });

  it('writes a picked variant and clears it again from the leading row', async () => {
    render(<Harness source={BARE} />);
    openPicker('Date');
    fireEvent.click(screen.getByRole('menuitem', { name: /Japanese era/ }));
    await waitFor(() => expect(doc()).toContain('date: wareki'));
    openPicker('Date');
    fireEvent.click(screen.getByRole('menuitem', { name: /Locale default/ }));
    await waitFor(() => expect(doc()).not.toContain('date: wareki'));
  });

  it('groups the picker by ORIGIN so a document format is not read as a locale one', () => {
    render(<Harness source={BARE} />);
    openPicker('Date');
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Formats in this document')).toBeTruthy();
    expect(within(menu).getByText('From the locale')).toBeTruthy();
    // The registry entry shows its bare wire spelling — it has no ICU label.
    expect(within(menu).getByRole('menuitem', { name: /stamp/ })).toBeTruthy();
  });

  it('offers a pattern surface on the dated types only', async () => {
    render(<Harness source={BARE} />);
    openPicker('Date');
    expect(screen.getByRole('menuitem', { name: 'Write a pattern…' })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    openPicker('Currency');
    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: 'Write a pattern…' })).toBeNull(),
    );
  });

  it('AUTHORS NOTHING when a pattern is left empty, and the field reseeds', async () => {
    render(<Harness source={BARE} />);
    openPicker('Date');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Write a pattern…' }));
    const field = await screen.findByLabelText('Pattern');
    fireEvent.blur(field);
    // `InlineFormat.pattern` is required: an empty write would author a
    // template the engine cannot parse, and every gate would stay green.
    expect(doc()).not.toContain('formats:');
  });

  it('writes an inline pattern as a whole-value replacement, then edits it in place', async () => {
    render(<Harness source={BARE} />);
    openPicker('Date');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Write a pattern…' }));
    const field = await screen.findByLabelText('Pattern');
    fireEvent.change(field, { target: { value: 'yyyy.MM' } });
    fireEvent.blur(field);
    await waitFor(() => expect(doc()).toContain('pattern: yyyy.MM'));
    fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'yyyy.MM.dd' } });
    fireEvent.blur(screen.getByLabelText('Pattern'));
    await waitFor(() => expect(doc()).toContain('pattern: yyyy.MM.dd'));
  });

  it('previews a DATETIME pattern under the datetime type, not the date one', async () => {
    render(<Harness source={BARE} />);
    openPicker('Date & time');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Write a pattern…' }));
    const field = await screen.findByLabelText('Pattern');
    fireEvent.change(field, { target: { value: 'yyyy HH:mm' } });
    fireEvent.blur(field);
    await waitFor(() => expect(doc()).toContain('datetime:'));
    expect(doc()).toContain('pattern: yyyy HH:mm');
  });

  it('reads an authored inline pattern back as a custom pattern row', async () => {
    render(<Harness source={`defaults:\n  formats:\n    date: { pattern: yyyy }\n${BARE}`} />);
    expect(screen.getByText('Custom pattern')).toBeTruthy();
    expect((await screen.findByLabelText('Pattern')).getAttribute('value')).toBe('yyyy');
  });

  it('edits an inline pattern IN PLACE, leaving its neighbours byte-identical', async () => {
    // A whole-map replacement would author the same YAML and pass every gate
    // while silently deleting the author's comments — the map node's own
    // `pattern` key is what must be written. The fixture is
    // registry-and-comment-sourced on purpose: an own-sourced one has no
    // neighbour to lose.
    const source = [
      'formats:',
      '  # the closing date on every statement',
      '  closing: { type: date, pattern: "yyyy.MM.dd" }',
      'defaults:',
      '  locale: ja-JP',
      '  formats:',
      '    # how a bare date reads in the body',
      '    date:',
      '      pattern: yyyy',
      '    currency: symbol',
      'sections:',
      '  body: { type: absolute }',
      '',
    ].join('\n');
    render(<Harness source={source} />);
    const field = await screen.findByLabelText('Pattern');
    fireEvent.change(field, { target: { value: 'yyyy.MM' } });
    fireEvent.blur(field);
    await waitFor(() => expect(doc()).toContain('pattern: yyyy.MM'));
    const after = doc();
    expect(after).toContain('# the closing date on every statement');
    expect(after).toContain('# how a bare date reads in the body');
    expect(after).toContain('closing: { type: date, pattern: "yyyy.MM.dd" }');
    expect(after).toContain('locale: ja-JP');
    expect(after).toContain('currency: symbol');
    // Exactly one line differs from the source.
    const changed = after.split('\n').filter((line, index) => line !== source.split('\n')[index]);
    expect(changed).toEqual(['      pattern: yyyy.MM']);
  });

  it('shows an authored variant by its label, and an uncatalogued one as itself', () => {
    render(
      <Harness source={`defaults:\n  formats:\n    date: wareki\n    currency: nope\n${BARE}`} />,
    );
    expect(screen.getByText('Japanese era')).toBeTruthy();
    expect(screen.getByText('nope')).toBeTruthy();
  });

  it('inserts a token at the caret and commits in one step', async () => {
    render(<Harness source={BARE} />);
    openPicker('Date');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Write a pattern…' }));
    const field = (await screen.findByLabelText('Pattern')) as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: 'Insert yyyy' }));
    await waitFor(() => expect(field.value).toBe('yyyy'));
    expect(doc()).toContain('pattern: yyyy');
  });
});
