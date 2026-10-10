// The panel's half of inline rich text, driven through `PropertyPanel` over a
// REAL `useEditor` — for the reason `SpansSection.test.tsx` gives: an op-builder
// suite asserts the LIST and a component suite the DISPATCH, and neither runs
// `applyOp`, so a batch the document would refuse passes both while the edit
// silently does nothing. The `doc` readout is the only assertion that sees it.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { FORMAT_CATALOG } from '../testkit/formatCatalog';
import { PropertyPanel } from './PropertyPanel';

const P = 'sections.body.items[0]';

afterEach(cleanup);

const DEFS = [
  'version: "0.2.0"',
  'type: object',
  'properties:',
  '  order:',
  '    type: object',
  '    properties:',
  '      code:',
  '        type: string',
  '        title: Order code',
  '        example: A-1',
].join('\n');

const SPANS = `sections:
  body:
    type: flow
    items:
      - type: text
        spans:
          - text: Shojiku
            style: { fontSize: 12pt }
          - data: { key: order.code }
`;

function Harness({
  source = SPANS,
  path = P,
  definitions = DEFS,
  capabilities,
}: {
  readonly source?: string;
  readonly path?: string;
  readonly definitions?: string;
  readonly capabilities?: readonly string[];
}) {
  const editor = useEditor(source);
  return (
    <I18nProvider locale="en">
      <PropertyPanel
        controller={editor}
        path={path}
        definitions={definitions}
        params="{}"
        gridStep={0}
        fontFamilies={['Noto Sans JP']}
        capabilities={capabilities}
        formatCatalog={FORMAT_CATALOG}
      />
      <pre data-testid="doc">{editor.text}</pre>
      {/* `applyAll([])` reports ok and BUMPS THE REVISION, so "the text did not
          move" cannot see an empty batch — a bumped revision is a dirty flag
          for an edit nobody made. */}
      <span data-testid="rev">{editor.revision}</span>
    </I18nProvider>
  );
}

const doc = () => screen.getByTestId('doc').textContent ?? '';
const rev = () => screen.getByTestId('rev').textContent;

/** Pick the fragment at `n` (1-based, as the rows are labelled). */
function pickRow(n: number) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Fragment ${n}:`) }));
}

/** Commit a per-fragment field. The label is scoped to the FRAGMENT, because
 * the format toolbar carries block-level controls with the same bare names. */
function commit(label: string, value: string, n = 1) {
  const field = screen.getByLabelText(`${label} for fragment ${n}`);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

describe('the per-fragment inspector', () => {
  it('names the fragment it is showing', () => {
    render(<Harness />);
    expect(screen.getByText('Fragment 1')).toBeTruthy();
    pickRow(2);
    expect(screen.getByText('Fragment 2')).toBeTruthy();
  });

  it('offers the METRIC style keys, and NOT the marks', () => {
    // The marks belong to the flow surface, where a selection can point at
    // them; a second control here would be a second way to say one thing.
    render(<Harness />);
    expect(screen.getByLabelText('Font size for fragment 1')).toBeTruthy();
    expect(screen.getByLabelText('Font family for fragment 1')).toBeTruthy();
    for (const mark of ['Bold', 'Italic', 'Underline', 'Strikethrough']) {
      expect(screen.queryByRole('button', { name: mark })).toBeNull();
    }
  });

  it('writes a fragment font size onto the FRAGMENT, not the item', () => {
    render(<Harness />);
    commit('Font size', '18pt');
    expect(doc()).toContain('fontSize: 18pt');
    // The item's own style is untouched — there is none, and none appeared.
    expect(doc()).toMatch(/- type: text\n\s+spans:/);
  });

  it('writes onto the fragment the reader picked, not the first one', () => {
    render(<Harness />);
    pickRow(2);
    commit('Font size', '9pt', 2);
    const text = doc();
    expect(text.indexOf('order.code')).toBeLessThan(text.indexOf('9pt'));
  });

  it('edits a bound fragment key, which the flow surface cannot', () => {
    // A `data:` fragment is ATOMIC in the flow — the reader can delete it but
    // cannot retype it — so this is the only surface that changes the binding.
    render(<Harness />);
    pickRow(2);
    commit('Data key', 'order.total', 2);
    expect(doc()).toContain('key: order.total');
  });

  it('offers NO data key for a text fragment', () => {
    render(<Harness />);
    expect(screen.queryByLabelText(/^Data key for fragment/)).toBeNull();
  });

  it('says where the words themselves are edited', () => {
    // The section deliberately shows no text control; an editing surface that
    // is silent about the half it does not own is a dead end.
    render(<Harness />);
    expect(screen.getByText('Words and their look are edited on the page.')).toBeTruthy();
  });

  it('writes a family through the TEXT arm, not the length one', () => {
    // `fontSize` is a length and `fontFamily` free text; they take different op
    // builders, and a surface that routed both through one would author a
    // family the engine cannot parse as a size.
    render(<Harness />);
    commit('Font family', 'Noto Sans JP');
    expect(doc()).toContain('fontFamily: Noto Sans JP');
  });

  it('writes nothing, and bumps no revision, for an unchanged commit', () => {
    // A field re-committed on blur at its own value is the ordinary way an
    // empty batch reaches `applyAll` — which reports ok and BUMPS THE REVISION,
    // i.e. flags the document dirty for an edit nobody made.
    render(<Harness />);
    const before = rev();
    commit('Font size', '12pt');
    expect(rev()).toBe(before);
  });

  it('bumps no revision for an unchanged BINDING key either', () => {
    render(<Harness />);
    pickRow(2);
    const before = rev();
    commit('Data key', 'order.code', 2);
    expect(rev()).toBe(before);
  });
});

/** A text item whose second fragment is bound, with the binding's options as
 * the caller writes them. */
function bound(binding: string): string {
  return SPANS.replace('- data: { key: order.code }', `- data: { key: order.code${binding} }`);
}

describe("a bound fragment's binding options", () => {
  it('offers the format and the blank placeholder, named for the fragment', () => {
    // The same `Binding` an item's own `data:` is, so the same two options.
    render(<Harness />);
    pickRow(2);
    expect(screen.getByLabelText('Data key for fragment 2')).toBeTruthy();
    expect(screen.getByLabelText('Format for fragment 2')).toBeTruthy();
    expect(screen.getByLabelText('Blank placeholder for fragment 2')).toBeTruthy();
  });

  it('keeps the binding editor after the key is emptied, so a field can be picked again', () => {
    // The emptied key stays on the wire (the validation warning is the point);
    // the fragment is still bound, and its picker must still be there.
    render(<Harness />);
    pickRow(2);
    commit('Data key', '', 2);
    expect(doc()).toContain('- data: { key: "" }');
    expect(screen.getByLabelText('Data key for fragment 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Order code/ }));
    expect(doc()).toContain('- data: { key: order.code }');
  });

  it('offers none of them for a text fragment', () => {
    render(<Harness />);
    for (const field of ['Data key', 'Format', 'Blank placeholder']) {
      expect(screen.queryByLabelText(`${field} for fragment 1`)).toBeNull();
    }
  });

  it('offers no placeholder where the engine cannot carry one', () => {
    render(<Harness capabilities={['text.spans']} />);
    pickRow(2);
    expect(screen.getByLabelText('Format for fragment 2')).toBeTruthy();
    expect(screen.queryByLabelText('Blank placeholder for fragment 2')).toBeNull();
  });

  it('writes the format and the placeholder onto the FRAGMENT binding, one undo step each', () => {
    render(<Harness />);
    pickRow(2);
    let before = Number(rev());
    commit('Format', 'upper', 2);
    expect(doc()).toContain('- data: { key: order.code, format: upper }');
    expect(Number(rev())).toBe(before + 1);
    before = Number(rev());
    commit('Blank placeholder', '—', 2);
    expect(doc()).toContain('placeholder: —');
    expect(Number(rev())).toBe(before + 1);
    // The item root carries no binding of its own: none appeared.
    expect(doc()).not.toMatch(/- type: text\n\s+data:/);
  });

  it('clears both options by emptying them', () => {
    render(<Harness source={bound(', format: upper, placeholder: none')} />);
    pickRow(2);
    const before = Number(rev());
    commit('Format', '', 2);
    expect(Number(rev())).toBe(before + 1);
    commit('Blank placeholder', '', 2);
    expect(Number(rev())).toBe(before + 2);
    expect(doc()).toContain('- data: { key: order.code }');
  });

  it('shows what the binding holds', () => {
    render(<Harness source={bound(', format: upper, placeholder: none')} />);
    pickRow(2);
    const value = (label: string) =>
      (screen.getByLabelText(`${label} for fragment 2`) as HTMLInputElement).value;
    expect(value('Format')).toBe('upper');
    expect(value('Blank placeholder')).toBe('none');
  });

  it('bumps no revision when either option blurs at its own value', () => {
    // The placeholder field commits on every blur; unguarded, re-writing the
    // same text was an undo step for an edit nobody made.
    render(<Harness source={bound(', format: upper, placeholder: none')} />);
    pickRow(2);
    const before = rev();
    commit('Format', 'upper', 2);
    commit('Blank placeholder', 'none', 2);
    expect(rev()).toBe(before);
    expect(doc()).toContain('- data: { key: order.code, format: upper, placeholder: none }');
  });

  it('authors nothing for an empty placeholder over an absent one', () => {
    render(<Harness source={bound(', format: upper')} />);
    pickRow(2);
    const before = rev();
    commit('Blank placeholder', '', 2);
    expect(rev()).toBe(before);
    expect(doc()).toContain('- data: { key: order.code, format: upper }');
  });

  it("lists the bound field's declared display formats first", () => {
    const defs = [
      'type: object',
      'properties:',
      '  issued:',
      '    type: string',
      '    format: date',
      '    displayFormats: [ { id: wareki, label: Japanese era } ]',
    ].join('\n');
    render(<Harness source={SPANS.replace('order.code', 'issued')} definitions={defs} />);
    pickRow(2);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a format' }));
    const first = screen.getAllByRole('menuitem')[0];
    expect(first?.querySelector('code')?.textContent).toBe('wareki');
    const before = Number(rev());
    fireEvent.click(screen.getByRole('menuitem', { name: /Japanese era/ }));
    expect(doc()).toContain('- data: { key: issued, format: wareki }');
    expect(Number(rev())).toBe(before + 1);
  });
});

describe('a bound fragment inside a row scope', () => {
  // A repeat cell re-scopes every binding inside it to the row — a fragment's
  // included, since it resolves through its item.
  const DEFS_ROWS = [
    'type: object',
    'properties:',
    '  shop:',
    '    type: string',
    '    title: Shop name',
    '  lines:',
    '    type: array',
    '    items:',
    '      type: object',
    '      properties:',
    '        sku:',
    '          type: string',
    '          title: SKU',
  ].join('\n');
  const inCell = (binding: string) => `sections:
  body:
    type: flow
    items:
      - type: repeat
        data: { key: lines }
        cell:
          items:
            - type: text
              spans:
                - text: "at "
                - data: { key: sku${binding} }
`;
  const CELL = 'sections.body.items[0].cell.items[0]';

  it('offers the top-level fields and writes the document scope with the pick, onto the fragment', () => {
    render(
      <Harness
        source={inCell('')}
        path={CELL}
        definitions={DEFS_ROWS}
        capabilities={['text.spans', 'binding.scope']}
      />,
    );
    pickRow(2);
    const before = Number(rev());
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Shop name/ }));
    expect(doc()).toContain('- data: { key: shop, scope: document }');
    expect(Number(rev())).toBe(before + 1);
  });

  it('drops an authored document scope when a row field is picked', () => {
    render(
      <Harness
        source={inCell(', scope: document')}
        path={CELL}
        definitions={DEFS_ROWS}
        capabilities={['text.spans', 'binding.scope']}
      />,
    );
    pickRow(2);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /SKU/ }));
    expect(doc()).toContain('- data: { key: sku }');
  });

  it("badges the fragment's authored document scope on the closed picker", () => {
    // The badge reads the FRAGMENT's scope — the item carries no `data:` here,
    // so a badge read off the item would never show.
    const { unmount } = render(
      <Harness
        source={inCell(', scope: document')}
        path={CELL}
        definitions={DEFS_ROWS}
        capabilities={['text.spans', 'binding.scope']}
      />,
    );
    pickRow(2);
    expect(screen.getAllByText('Document').length).toBe(1);
    unmount();
    render(
      <Harness
        source={inCell('')}
        path={CELL}
        definitions={DEFS_ROWS}
        capabilities={['text.spans', 'binding.scope']}
      />,
    );
    pickRow(2);
    expect(screen.queryByText('Document')).toBeNull();
  });

  it('offers no document section where the engine cannot carry a scope', () => {
    render(
      <Harness
        source={inCell('')}
        path={CELL}
        definitions={DEFS_ROWS}
        capabilities={['text.spans']}
      />,
    );
    pickRow(2);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.queryByRole('menuitem', { name: /Shop name/ })).toBeNull();
  });
});

describe('a bound fragment outside a row scope', () => {
  it('offers no scope choice and writes none', () => {
    render(<Harness capabilities={['text.spans', 'binding.scope']} />);
    pickRow(2);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    // No second section: at document scope element and document resolve alike.
    expect(screen.queryByText('Document')).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: /Order code/ }));
    expect(doc()).not.toContain('scope:');
  });
});
