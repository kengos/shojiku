import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { buildFormatUsage } from '../formats/usage';
import { I18nProvider } from '../i18n/context';
import { readDefinitionsView } from '../palette/model';
import { FORMAT_CATALOG, fakeProbe } from '../testkit/formatCatalog';
import { FormatsManager } from './FormatsManager';

function Harness({
  source,
  definitions,
  usageNull = false,
  maxBytes = 2_000_000,
}: {
  readonly source: string;
  /** Definitions text: what tells the usage walk which bindings are DATED, and
   * so which `format:` values are registry references at all. */
  readonly definitions?: string;
  readonly usageNull?: boolean;
  readonly maxBytes?: number;
}) {
  const editor = useEditor(source);
  const groups = definitions === undefined ? null : readDefinitionsView(definitions);
  return (
    <I18nProvider locale="en">
      <FormatsManager
        controller={editor}
        usage={usageNull ? null : buildFormatUsage(editor.text, groups)}
        catalog={FORMAT_CATALOG}
        probe={fakeProbe()}
        maxBytes={maxBytes}
      />
      <pre data-testid="doc">{editor.text}</pre>
      <button type="button" data-testid="undo" onClick={editor.undo}>
        undo
      </button>
    </I18nProvider>
  );
}

const REGISTERED = [
  'formats:',
  '  stamp: { type: date, pattern: "yyyy.MM.dd" }',
  '  received: { type: datetime, pattern: "MM/dd HH:mm" }',
  'defaults:',
  '  formats:',
  '    date: stamp',
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        text: "{when}"',
  '        data: { key: when, format: stamp }',
  '',
].join('\n');

const BARE = 'sections:\n  body: { type: absolute }\n';
const doc = () => screen.getByTestId('doc').textContent ?? '';
const rows = () => screen.getAllByRole('listitem');
const faceOf = (row: HTMLElement) =>
  within(row)
    .getAllByRole('button')
    .filter((el) => el.getAttribute('aria-haspopup') === null)[0];

async function pickRowAction(row: HTMLElement, action: string) {
  fireEvent.click(within(row).getByRole('button', { name: /actions/ }));
  fireEvent.click(await screen.findByRole('menuitem', { name: action }));
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
}

describe('FormatsManager', () => {
  it('lists each entry with its kind, what it RENDERS, and its impact scope', () => {
    render(<Harness source={REGISTERED} />);
    const [stamp] = rows();
    expect(within(stamp).getByText('stamp')).toBeTruthy();
    expect(within(stamp).getByText('date')).toBeTruthy();
    // The sample is the engine's, not the raw pattern.
    expect(within(stamp).getByText('2026.11.03')).toBeTruthy();
    // Two references: the binding and `defaults.formats.date`.
    expect(within(stamp).getByText('Used in 2 places')).toBeTruthy();
    expect(within(rows()[1]).getByText('Unused')).toBeTruthy();
  });

  it('falls back to the raw pattern when the engine has no sample for the entry', () => {
    render(<Harness source={REGISTERED} />);
    // `received` is not in the catalog fixture — better its own pattern than
    // a blank cell.
    expect(within(rows()[1]).getByText('MM/dd HH:mm')).toBeTruthy();
  });

  it('says so when the registry is empty', () => {
    render(<Harness source={BARE} />);
    expect(screen.getByText('No formats defined yet.')).toBeTruthy();
  });

  it('creates an entry as ONE whole-entry write', async () => {
    render(<Harness source={'sections:\n  body: { type: absolute }\n'} />);
    fireEvent.click(screen.getByRole('button', { name: 'New format' }));
    fireEvent.change(screen.getByLabelText('Format name'), { target: { value: 'closing' } });
    fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'yyyy.MM.dd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(doc()).toContain('closing'));
    expect(doc()).toContain('type: date');
    expect(doc()).toContain('yyyy.MM.dd');
    // One undo step for the whole entry.
    fireEvent.click(screen.getByTestId('undo'));
    await waitFor(() => expect(doc()).not.toContain('closing'));
  });

  it('REFUSES a create with no pattern, and writes nothing', async () => {
    render(<Harness source={'sections:\n  body: { type: absolute }\n'} />);
    fireEvent.click(screen.getByRole('button', { name: 'New format' }));
    fireEvent.change(screen.getByLabelText('Format name'), { target: { value: 'closing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Enter a pattern — a format cannot be saved without one.'),
    ).toBeTruthy();
    expect(doc()).not.toContain('closing');
  });

  it('REFUSES a create named after a field type', async () => {
    render(<Harness source={'sections:\n  body: { type: absolute }\n'} />);
    fireEvent.click(screen.getByRole('button', { name: 'New format' }));
    fireEvent.change(screen.getByLabelText('Format name'), { target: { value: 'currency' } });
    fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('That is a field type name, so it cannot name a format.'),
    ).toBeTruthy();
    expect(doc()).not.toContain('currency:');
  });

  it('edits an entry, touching only the changed key', async () => {
    render(<Harness source={REGISTERED} />);
    fireEvent.click(faceOf(rows()[0]));
    fireEvent.change(await screen.findByLabelText('Pattern'), { target: { value: 'yyyy/MM/dd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(doc()).toContain('yyyy/MM/dd'));
    // The neighbouring entry is byte-intact.
    expect(doc()).toContain('received: { type: datetime, pattern: "MM/dd HH:mm" }');
  });

  it('closes an edit that changed nothing without minting an undo step', async () => {
    render(<Harness source={REGISTERED} />);
    const before = doc();
    fireEvent.click(faceOf(rows()[0]));
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByLabelText('Pattern')).toBeNull());
    expect(doc()).toBe(before);
  });

  it('renames the entry AND both kinds of reference in ONE undo step', async () => {
    render(<Harness source={REGISTERED} />);
    await pickRowAction(rows()[0], 'Rename');
    fireEvent.change(screen.getByLabelText('Format name'), { target: { value: 'cutoff' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(doc()).toContain('cutoff:'));
    expect(doc()).toContain('format: cutoff');
    expect(doc()).toContain('date: cutoff');
    expect(doc()).not.toContain('stamp');
    fireEvent.click(screen.getByTestId('undo'));
    await waitFor(() => expect(doc()).toContain('stamp:'));
    expect(doc()).toContain('format: stamp');
    expect(doc()).toContain('date: stamp');
  });

  it('refuses a rename to a duplicate name and changes nothing', async () => {
    render(<Harness source={REGISTERED} />);
    const before = doc();
    await pickRowAction(rows()[0], 'Rename');
    fireEvent.change(screen.getByLabelText('Format name'), { target: { value: 'received' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(await screen.findByText('That name is already in use.')).toBeTruthy();
    expect(doc()).toBe(before);
  });

  it('refuses a rename when the usage index is null — unsafe to rewrite', async () => {
    render(<Harness source={REGISTERED} usageNull />);
    const before = doc();
    await pickRowAction(rows()[0], 'Rename');
    fireEvent.change(screen.getByLabelText('Format name'), { target: { value: 'cutoff' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(
      await screen.findByText('The document is too large to rewrite references safely.'),
    ).toBeTruthy();
    expect(doc()).toBe(before);
  });

  it('deletes an UNUSED entry straight through', async () => {
    render(<Harness source={REGISTERED} />);
    await pickRowAction(rows()[1], 'Delete');
    await waitFor(() => expect(doc()).not.toContain('received'));
  });

  it('deletes a USED entry behind a confirm that states the impact first', async () => {
    render(<Harness source={REGISTERED} />);
    await pickRowAction(rows()[0], 'Delete');
    // The confirm strip STATES the impact before the irreversible click.
    expect(within(rows()[0]).getByText(/Delete this format\? Used in 2 places/)).toBeTruthy();
    // Cancelling is a no-op.
    fireEvent.click(within(rows()[0]).getByRole('button', { name: 'Cancel' }));
    expect(doc()).toContain('stamp:');
    await pickRowAction(rows()[0], 'Delete');
    fireEvent.click(within(rows()[0]).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(doc()).not.toContain('stamp'));
    // Every reference is cleared, not left dangling.
    expect(doc()).not.toContain('format:');
  });

  it('does NOT rename on an IME-confirming Enter', async () => {
    // A Japanese author presses Enter to confirm a kanji conversion, and a
    // single-input form submits on Enter — so without the guard the rename
    // commits the half-converted reading AND rewrites every reference to it.
    render(<Harness source={REGISTERED} />);
    const before = doc();
    await pickRowAction(rows()[0], 'Rename');
    const field = screen.getByLabelText('Format name');
    fireEvent.change(field, { target: { value: 'しめび' } });
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    expect(doc()).toBe(before);
    // The same Enter, composition over, does rename.
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.submit(field.closest('form') as HTMLFormElement);
    await waitFor(() => expect(doc()).toContain('しめび'));
  });

  it('cancels a rename without changing anything', async () => {
    render(<Harness source={REGISTERED} />);
    const before = doc();
    await pickRowAction(rows()[0], 'Rename');
    fireEvent.change(screen.getByLabelText('Format name'), { target: { value: 'cutoff' } });
    fireEvent.click(within(rows()[0]).getByRole('button', { name: 'Cancel' }));
    expect(doc()).toBe(before);
  });

  it('renders a hostile registry name as TEXT and addresses it literally', async () => {
    render(
      <Harness
        source={'formats:\n  "__proto__": { type: date, pattern: y }\nsections:\n  body: {}\n'}
      />,
    );
    expect(screen.getByText('__proto__')).toBeTruthy();
    await pickRowAction(rows()[0], 'Delete');
    await waitFor(() => expect(doc()).not.toContain('__proto__'));
    expect(({} as Record<string, unknown>).type).toBeUndefined();
  });
});

describe('FormatsManager — a registry name that collides with a builtin spelling', () => {
  // The defect this suite pins: `symbol` is the currency's builtin variant AND
  // (here) a registry entry name. Before the dated-binding filter, renaming the
  // entry rewrote the currency binding and `defaults.formats.currency` too,
  // silently changing how money displayed — and DELETING it stripped their
  // `format:` keys outright.
  const DEFINITIONS = [
    'type: object',
    'properties:',
    '  order:',
    '    type: object',
    '    properties:',
    '      when: { type: string, format: date }',
    '      total: { type: number, format: currency }',
    '',
  ].join('\n');

  const COLLIDING = [
    'formats:',
    '  symbol: { type: date, pattern: "yyyy.MM.dd" }',
    'defaults:',
    '  formats:',
    '    currency: symbol',
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - { type: text, text: a, data: { key: order.when, format: symbol } }',
    '      - { type: text, text: b, data: { key: order.total, format: symbol } }',
    '      - { type: text, text: "paid {order.when:symbol}" }',
    '      - { type: text, text: "due {order.total:symbol}" }',
    '',
  ].join('\n');

  /** The two lines that must survive byte-identically: the currency binding and
   * the currency default, neither of which can reach the registry. */
  const CURRENCY_BINDING = 'data: { key: order.total, format: symbol }';
  const CURRENCY_DEFAULT = 'currency: symbol';
  const CURRENCY_CHIP = 'due {order.total:symbol}';

  it('counts only the references that can actually REACH the registry', () => {
    render(<Harness source={COLLIDING} definitions={DEFINITIONS} />);
    // Four sites spell `symbol`; only the two on the DATE field are references
    // — the dated binding and the dated chip.
    expect(within(rows()[0]).getByText('Used in 2 places')).toBeTruthy();
  });

  it('renames the dated references and leaves the currency ones byte-identical', async () => {
    render(<Harness source={COLLIDING} definitions={DEFINITIONS} />);
    await pickRowAction(rows()[0], 'Rename');
    fireEvent.change(screen.getByLabelText('Format name'), { target: { value: 'stamp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(doc()).toContain('stamp:'));
    expect(doc()).toContain('data: { key: order.when, format: stamp }');
    expect(doc()).toContain('paid {order.when:stamp}');
    // The currency sites are untouched — the whole point of the fix.
    expect(doc()).toContain(CURRENCY_BINDING);
    expect(doc()).toContain(CURRENCY_DEFAULT);
    expect(doc()).toContain(CURRENCY_CHIP);
    // ONE undo step puts every rewritten site back.
    fireEvent.click(screen.getByTestId('undo'));
    await waitFor(() => expect(doc()).toBe(COLLIDING));
  });

  it('clears the dated references on DELETE and leaves the currency ones alone', async () => {
    render(<Harness source={COLLIDING} definitions={DEFINITIONS} />);
    await pickRowAction(rows()[0], 'Delete');
    fireEvent.click(within(rows()[0]).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(doc()).not.toContain('symbol: { type: date'));
    // The dated binding loses its format key; the dated chip loses its pick.
    expect(doc()).toContain('data: { key: order.when }');
    expect(doc()).toContain('paid {order.when}');
    // The currency sites keep theirs — deleting the entry says nothing about
    // the currency's own `symbol` variant.
    expect(doc()).toContain(CURRENCY_BINDING);
    expect(doc()).toContain(CURRENCY_DEFAULT);
    expect(doc()).toContain(CURRENCY_CHIP);
    fireEvent.click(screen.getByTestId('undo'));
    await waitFor(() => expect(doc()).toBe(COLLIDING));
  });

  it('still rewrites EVERY site when there are no definitions to resolve against', async () => {
    // Without definitions nothing is resolvable, so the walk records every
    // site — over-rewriting, which is today's behaviour and visible, rather
    // than under-rewriting, which leaves a dangling name.
    render(<Harness source={COLLIDING} />);
    expect(within(rows()[0]).getByText('Used in 4 places')).toBeTruthy();
  });

  it('REFUSES to mint a name that is a builtin variant spelling', async () => {
    render(<Harness source={BARE} />);
    fireEvent.click(screen.getByRole('button', { name: 'New format' }));
    fireEvent.change(screen.getByLabelText('Format name'), { target: { value: 'symbol' } });
    fireEvent.change(screen.getByLabelText('Pattern'), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(
        'That word already names a built-in format on another field type, so it would be ambiguous here.',
      ),
    ).toBeTruthy();
    expect(doc()).not.toContain('symbol');
  });

  it('REFUSES a rename INTO such a name, changing nothing', async () => {
    render(<Harness source={REGISTERED} />);
    const before = doc();
    await pickRowAction(rows()[0], 'Rename');
    fireEvent.change(screen.getByLabelText('Format name'), { target: { value: 'value' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(
      await screen.findByText(
        'That word already names a built-in format on another field type, so it would be ambiguous here.',
      ),
    ).toBeTruthy();
    expect(doc()).toBe(before);
  });
});
