// A list's two catalog disclosures on the content tab, over a REAL editor
// through PropertyPanel, so each assertion reads what the file becomes:
// 「差し込みの設定」 (the declaration cards: use count, fields, delete arms, add
// with the suggested name) and 「その他の設定」 (`overflowText`). Both are
// closed by default and opening them authors nothing; every edit is one op
// and undo returns the bytes; the engine's capabilities decide what is drawn.

import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { PropertyPanel } from './PropertyPanel';

const P = 'sections.body.items[0]';

const DEFINITIONS = `properties:
  rows:
    type: array
    title: Rows
    items:
      type: object
      properties:
        unit_price: { type: number, title: Unit price }
        qty: { type: number, title: Quantity }
        name: { type: string, title: Name }
`;

/** A list over `rows` carrying `extra` (four-space indented item lines). */
function source(...extra: string[]): string {
  return [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: list',
    '        data: { key: rows }',
    ...extra.map((l) => `        ${l}`),
    '',
  ].join('\n');
}

const PRICED = source(
  'text: "{price} / {price:yen} {name}"',
  'bindings:',
  '  # the price the row reads',
  '  price: { key: unit_price }',
);

function Harness({ text, capabilities }: { text: string; capabilities?: readonly string[] }) {
  const editor = useEditor(text);
  const [path, setPath] = useState(P);
  return (
    <I18nProvider locale="en">
      <PropertyPanel
        controller={editor}
        path={path}
        capabilities={capabilities}
        definitions={DEFINITIONS}
      />
      <button type="button" onClick={editor.undo}>
        undo
      </button>
      <button type="button" onClick={() => setPath(P.replace('[0]', '[1]'))}>
        select the second
      </button>
      <pre data-testid="doc">{editor.text}</pre>
    </I18nProvider>
  );
}

const doc = () => screen.getByTestId('doc').textContent ?? '';

/** The lines of the document that differ from `before`, either side. */
function changed(before: string): string[] {
  const now = doc().split('\n');
  const was = before.split('\n');
  return [...now.filter((l) => !was.includes(l)), ...was.filter((l) => !now.includes(l))];
}

const toggle = (name: string | RegExp) => screen.getByRole('button', { name });
const blur = (label: string, value: string) =>
  fireEvent.blur(screen.getByLabelText(label), { target: { value } });
const card = (name: string) => screen.getByText(name).closest('li') as HTMLElement;
/** The add form's data key: the last "Data key" (the source picker is first). */
const addKey = (value: string) =>
  fireEvent.blur(screen.getAllByLabelText('Data key').at(-1) as HTMLElement, {
    target: { value },
  });

describe('the two disclosures', () => {
  it('sit closed under the data source, counting declarations and set keys; opening authors nothing', () => {
    const text = source(
      'text: "{price}"',
      'overflowText: "+{count} more"',
      'bindings: { price: { key: unit_price }, qty: { key: qty } }',
    );
    render(<Harness text={text} />);
    const bindings = toggle('Merge fields (2)');
    const more = toggle('More settings (1 set)');
    expect(bindings.getAttribute('aria-expanded')).toBe('false');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    const entry = screen.getByLabelText('Entry text');
    expect(entry.compareDocumentPosition(bindings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bindings.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const button of [bindings, more]) {
      fireEvent.click(button);
      fireEvent.click(button);
    }
    expect(doc()).toBe(text);
    // The declaration count stays in the title while open; the set count goes.
    fireEvent.click(bindings);
    fireEvent.click(more);
    expect(toggle('Merge fields (2)').getAttribute('aria-expanded')).toBe('true');
    expect(toggle('More settings').getAttribute('aria-expanded')).toBe('true');
  });

  it('carry no count with nothing declared or set', () => {
    render(<Harness text={source('text: "{name}"')} />);
    expect(toggle('Merge fields')).toBeTruthy();
    expect(toggle('More settings')).toBeTruthy();
  });

  it('follow the engine: no declarations without the capability, gated fields dropped', () => {
    const { unmount } = render(<Harness text={PRICED} capabilities={[]} />);
    expect(screen.queryByRole('button', { name: /Merge fields/ })).toBeNull();
    expect(toggle('More settings')).toBeTruthy();
    unmount();
    render(<Harness text={PRICED} capabilities={['binding.declarations']} />);
    fireEvent.click(toggle('Merge fields (1)'));
    expect(screen.getByLabelText('Data key', { selector: 'li input' })).toBeTruthy();
    expect(screen.queryByLabelText('Blank placeholder')).toBeNull();
    expect(screen.queryByLabelText('Reads from')).toBeNull();
  });
});

describe('overflowText', () => {
  it('shows its initial, writes one line, removes on empty, and undoes byte for byte', () => {
    render(<Harness text={PRICED} />);
    fireEvent.click(toggle('More settings'));
    const input = screen.getByLabelText("Last line when rows don't fit") as HTMLInputElement;
    expect(input.placeholder).toBe('+{count}');
    expect(screen.getByText(/becomes the number of rows not shown/)).toBeTruthy();
    blur("Last line when rows don't fit", '');
    expect(doc()).toBe(PRICED);
    blur("Last line when rows don't fit", 'and {count} more');
    expect(changed(PRICED)).toEqual(['        overflowText: and {count} more']);
    blur("Last line when rows don't fit", 'and {count} more');
    blur("Last line when rows don't fit", ' ');
    expect(doc()).toBe(PRICED);
    // Two ops, the unchanged blur none: each undo steps back one of them.
    fireEvent.click(screen.getByText('undo'));
    expect(changed(PRICED)).toEqual(['        overflowText: and {count} more']);
    fireEvent.click(screen.getByText('undo'));
    expect(doc()).toBe(PRICED);
  });
});

describe('a declaration card', () => {
  it('names the declaration, counts its uses, and edits each field as one op', () => {
    render(<Harness text={PRICED} />);
    fireEvent.click(toggle('Merge fields (1)'));
    expect(screen.getByText(/Decides what goes into each \{name\}/)).toBeTruthy();
    const price = within(card('{price}'));
    expect(price.getByText('Uses in the entry text: 2')).toBeTruthy();
    const labels = price.getAllByText(/^(Data key|Format|Blank placeholder|Reads from)$/);
    expect(labels.map((label) => label.textContent)).toEqual([
      'Data key',
      'Format',
      'Blank placeholder',
      'Reads from',
    ]);
    expect((price.getByLabelText('Data key') as HTMLInputElement).value).toBe('unit_price');
    fireEvent.blur(price.getByLabelText('Blank placeholder'), { target: { value: '—' } });
    expect(changed(PRICED)).toEqual(
      ['  price: { key: unit_price, placeholder: — }', '  price: { key: unit_price }'].map(
        (l) => `        ${l}`,
      ),
    );
    // One op: one undo step returns the bytes.
    fireEvent.click(screen.getByText('undo'));
    expect(doc()).toBe(PRICED);
    const scope = price.getByLabelText('Reads from') as HTMLSelectElement;
    expect([...scope.options].map((o) => o.text)).toEqual(['(default)', 'Each row', 'Document']);
    fireEvent.change(scope, { target: { value: 'document' } });
    expect(doc()).toContain('price: { key: unit_price, scope: document }');
    fireEvent.change(price.getByLabelText('Reads from'), { target: { value: '' } });
    expect(doc()).toBe(PRICED);
    // The text keeps every use through all of it.
    expect(doc()).toContain('text: "{price} / {price:yen} {name}"');
  });

  it('never clears the data key: emptying it writes nothing and shows the key again', () => {
    render(<Harness text={PRICED} />);
    fireEvent.click(toggle('Merge fields (1)'));
    const key = () => within(card('{price}')).getByLabelText('Data key') as HTMLInputElement;
    fireEvent.blur(key(), { target: { value: '' } });
    expect(doc()).toBe(PRICED);
    expect(key().value).toBe('unit_price');
    fireEvent.blur(key(), { target: { value: 'qty' } });
    expect(changed(PRICED)).toEqual([
      '          price: { key: qty }',
      '          price: { key: unit_price }',
    ]);
  });

  it('writes a format the card picker offers for the key, as one op', () => {
    render(<Harness text={PRICED} />);
    fireEvent.click(toggle('Merge fields (1)'));
    const price = within(card('{price}'));
    // unit_price is a number: the picker offers what a number takes.
    fireEvent.click(price.getByRole('button', { name: 'Choose a format' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Percentage/ }));
    expect(changed(PRICED)).toEqual([
      '          price: { key: unit_price, format: percentage }',
      '          price: { key: unit_price }',
    ]);
    fireEvent.click(screen.getByText('undo'));
    expect(doc()).toBe(PRICED);
  });

  it('marks an unused declaration and says so', () => {
    render(<Harness text={source('text: "{name}"', 'bindings: { qty: { key: qty } }')} />);
    fireEvent.click(toggle('Merge fields (1)'));
    const qty = within(card('{qty}'));
    expect(qty.getByText('Not used')).toBeTruthy();
    expect(qty.getByText(/does not use it yet/)).toBeTruthy();
    expect(qty.queryByText(/Uses in the entry text/)).toBeNull();
  });

  it('draws a declaration that is not a map with nothing to edit, and still deletes it', () => {
    const text = source('text: "{name}"', 'bindings: { odd: 3, qty: { key: qty } }');
    render(<Harness text={text} />);
    fireEvent.click(toggle('Merge fields (2)'));
    expect(within(card('{odd}')).queryByLabelText('Data key')).toBeNull();
    fireEvent.click(within(card('{odd}')).getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(card('{odd}')).getAllByRole('button', { name: 'Delete' })[1]);
    expect(changed(text)).toEqual([
      '        bindings: { qty: { key: qty } }',
      '        bindings: { odd: 3, qty: { key: qty } }',
    ]);
  });
});

describe('deleting a declaration', () => {
  /** Opens the card's inline confirm and returns its words. */
  function confirmText(name: string): string {
    fireEvent.click(within(card(name)).getByRole('button', { name: 'Delete' }));
    return within(card(name)).getByText(/^Delete “/).textContent ?? '';
  }

  it('says the text reads the row field of that NAME when the key differs, then removes the entry', () => {
    render(<Harness text={PRICED} />);
    fireEvent.click(toggle('Merge fields (1)'));
    expect(confirmText('{price}')).toBe(
      'Delete “price”? {price} (2 in the entry text) will read the row’s “price” instead of the data key “unit_price”.',
    );
    fireEvent.click(within(card('{price}')).getByRole('button', { name: 'Cancel' }));
    expect(within(card('{price}')).queryByText(/^Delete “/)).toBeNull();
    expect(doc()).toBe(PRICED);
    confirmText('{price}');
    fireEvent.click(within(card('{price}')).getAllByRole('button', { name: 'Delete' })[1]);
    // The last declaration takes the map, its comment included; the text stays.
    expect(changed(PRICED)).toEqual([
      '        bindings:',
      '          # the price the row reads',
      '          price: { key: unit_price }',
    ]);
    fireEvent.click(screen.getByText('undo'));
    expect(doc()).toBe(PRICED);
  });

  it('says the key keeps being read when the name is its own key, and that an unused one is not used', () => {
    const text = source(
      'text: "{qty}"',
      'bindings: { qty: { key: qty, format: integer }, name: { key: name } }',
    );
    render(<Harness text={text} />);
    fireEvent.click(toggle('Merge fields (2)'));
    expect(confirmText('{qty}')).toBe(
      'Delete “qty”? {qty} (1 in the entry text) keeps reading the row’s “qty”. Its format and blank placeholder go back to the data item’s own.',
    );
    expect(confirmText('{name}')).toBe('Delete “name”? It is not used anywhere.');
    fireEvent.click(within(card('{qty}')).getAllByRole('button', { name: 'Delete' })[1]);
    expect(changed(text)).toEqual([
      '        bindings: { name: { key: name } }',
      '        bindings: { qty: { key: qty, format: integer }, name: { key: name } }',
    ]);
  });

  it('says the text stops reading the document when the declaration read it', () => {
    render(
      <Harness
        text={source('text: "{qty}"', 'bindings: { qty: { key: qty, scope: document } }')}
      />,
    );
    fireEvent.click(toggle('Merge fields (1)'));
    expect(confirmText('{qty}')).toBe(
      'Delete “qty”? {qty} (1 in the entry text) will read the row’s “qty” instead of the document’s “qty”.',
    );
  });
});

describe('adding a declaration', () => {
  const NAME = 'Name';

  it('picks the key first, suggests its name, and adds one entry', () => {
    const text = source('text: "{name}"');
    render(<Harness text={text} />);
    fireEvent.click(toggle('Merge fields'));
    fireEvent.click(screen.getByRole('button', { name: '+ Add a merge field' }));
    const add = screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    addKey('unit_price');
    expect((screen.getByLabelText(NAME) as HTMLInputElement).value).toBe('unit_price');
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    expect(changed(text)).toEqual([
      '        bindings:',
      '          unit_price:',
      '            key: unit_price',
    ]);
    expect(toggle('Merge fields (1)')).toBeTruthy();
    expect(screen.queryByLabelText(NAME)).toBeNull();
    fireEvent.click(screen.getByText('undo'));
    expect(doc()).toBe(text);
  });

  it('leaves a name the key cannot suggest empty, and keeps a typed name across a re-pick', () => {
    render(<Harness text={source('text: "{name}"')} />);
    fireEvent.click(toggle('Merge fields'));
    fireEvent.click(screen.getByRole('button', { name: '+ Add a merge field' }));
    addKey('品名');
    const name = screen.getByLabelText(NAME) as HTMLInputElement;
    expect(name.value).toBe('');
    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Example: price/)).toBeTruthy();
    fireEvent.change(name, { target: { value: 'label' } });
    addKey('qty');
    expect(name.value).toBe('label');
  });

  it('lets the suggested name follow a re-pick, and adds nothing without a key', () => {
    render(<Harness text={source('text: "{name}"')} />);
    fireEvent.click(toggle('Merge fields'));
    fireEvent.click(screen.getByRole('button', { name: '+ Add a merge field' }));
    const name = screen.getByLabelText(NAME) as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'label' } });
    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(name, { target: { value: '' } });
    addKey('unit_price');
    addKey('qty');
    expect(name.value).toBe('qty');
  });

  it('adds beside the declarations already there, leaving them and their comment', () => {
    render(<Harness text={PRICED} />);
    fireEvent.click(toggle('Merge fields (1)'));
    fireEvent.click(screen.getByRole('button', { name: '+ Add a merge field' }));
    addKey('qty');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(changed(PRICED)).toEqual(['          qty:', '            key: qty']);
    expect(toggle('Merge fields (2)')).toBeTruthy();
    fireEvent.click(screen.getByText('undo'));
    expect(doc()).toBe(PRICED);
  });

  it('adds to a bindings: that holds no map yet', () => {
    const text = source('text: "{name}"', 'bindings:');
    render(<Harness text={text} />);
    fireEvent.click(toggle('Merge fields'));
    fireEvent.click(screen.getByRole('button', { name: '+ Add a merge field' }));
    addKey('qty');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(within(card('{qty}')).getByText('Not used')).toBeTruthy();
    // `bindings:` stays where it was; the entry goes under it.
    expect(doc()).toBe(
      text.replace('bindings:\n', 'bindings:\n          qty:\n            key: qty\n'),
    );
  });

  it('closes an open form and confirm when another list is selected', () => {
    const second =
      '      - { type: list, data: { key: rows }, text: "{price}", bindings: { price: { key: qty } } }';
    render(<Harness text={`${PRICED}${second}\n`} />);
    fireEvent.click(toggle('Merge fields (1)'));
    fireEvent.click(within(card('{price}')).getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Add a merge field' }));
    fireEvent.click(screen.getByText('select the second'));
    expect(screen.queryByLabelText(NAME)).toBeNull();
    expect(screen.queryByText(/^Delete “/)).toBeNull();
    expect(toggle('Merge fields (1)').getAttribute('aria-expanded')).toBe('false');
  });

  it('offers no row field before the list has a source', () => {
    render(
      <Harness text={source('text: "{name}"').replace('        data: { key: rows }\n', '')} />,
    );
    fireEvent.click(toggle('Merge fields'));
    fireEvent.click(screen.getByRole('button', { name: '+ Add a merge field' }));
    const pickers = screen.getAllByRole('button', { name: 'Choose a data field' });
    fireEvent.click(pickers[pickers.length - 1]);
    expect(screen.getByText('No data fields to choose from.')).toBeTruthy();
  });

  it('refuses a taken name and one the text could not write, saying why', () => {
    const text = source('text: "{price}"', 'bindings: { price: { key: unit_price } }');
    render(<Harness text={text} />);
    fireEvent.click(toggle('Merge fields (1)'));
    fireEvent.click(screen.getByRole('button', { name: '+ Add a merge field' }));
    addKey('qty');
    const name = screen.getByLabelText(NAME);
    const add = screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement;
    fireEvent.change(name, { target: { value: 'price' } });
    expect(screen.getByText('This name is already in use.')).toBeTruthy();
    expect(add.disabled).toBe(true);
    fireEvent.change(name, { target: { value: 'unit-price' } });
    expect(screen.getByText('This name has characters that cannot be used.')).toBeTruthy();
    expect(add.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText(NAME)).toBeNull();
    expect(doc()).toBe(text);
  });
});
