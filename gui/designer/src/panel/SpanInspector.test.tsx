// The panel's half of inline rich text, driven through `PropertyPanel` over a
// REAL `useEditor` — for the reason `SpansSection.test.tsx` gives: an op-builder
// suite asserts the LIST and a component suite the DISPATCH, and neither runs
// `applyOp`, so a batch the document would refuse passes both while the edit
// silently does nothing. The `doc` readout is the only assertion that sees it.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
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

function Harness({ source = SPANS }: { readonly source?: string }) {
  const editor = useEditor(source);
  return (
    <I18nProvider locale="en">
      <PropertyPanel
        controller={editor}
        path={P}
        definitions={DEFS}
        params="{}"
        gridStep={0}
        fontFamilies={['Noto Sans JP']}
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
