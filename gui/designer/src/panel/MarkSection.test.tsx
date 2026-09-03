// The mark presence section on its own, over a REAL editor. `marks.test.tsx`
// drives it through PropertyPanel (which is what proves the prop threading);
// this file hands it the props directly, because two of its arms depend on the
// SCOPE it is mounted in — the second field section, and the scope-carrying
// pick — and those are not reachable from a document-scope panel.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import type { ChipContext } from '../text/chipContext';
import type { ItemPanelProps } from './itemPanelProps';
import { readItemView } from './itemView';
import { MarkSection } from './MarkSection';
import type { PickerOption } from './pickerModel';

const PATH = 'sections.body.items[0]';

const OPTIONS: readonly PickerOption[] = [
  { key: 'method', label: 'Method', type: 'string', sample: 'card', enumValues: ['card', 'cash'] },
  { key: 'agreed', label: 'Agreed', type: 'boolean', sample: 'true', enumValues: [] },
  { key: 'count', label: 'Count', type: 'number', sample: '2', enumValues: [] },
];
const DOC_OPTIONS: readonly PickerOption[] = [
  { key: 'paid', label: 'Paid', type: 'boolean', sample: 'true', enumValues: [] },
];

const CHECKBOX = `sections:
  body:
    type: flow
    items:
      - type: checkbox
`;

function chips(scope: string | null, documentOptions: readonly PickerOption[]): ChipContext {
  return {
    options: OPTIONS,
    documentOptions,
    scope,
    declared: new Map(),
    canDeclare: true,
    otherNames: [],
  };
}

function Harness({
  source = CHECKBOX,
  scope = null,
  capabilities,
}: {
  readonly source?: string;
  readonly scope?: string | null;
  readonly capabilities?: readonly string[];
}) {
  const editor = useEditor(source);
  const view = readItemView(editor.read(PATH));
  const props = {
    controller: editor,
    path: PATH,
    view: view ?? { type: 'checkbox' },
    fontFamilies: [],
    capabilities,
    paletteGroups: null,
    params: '{}',
    gridStep: 1,
  } as unknown as ItemPanelProps;
  return (
    <I18nProvider locale="en">
      <MarkSection props={props} chips={chips(scope, DOC_OPTIONS)} />
      <pre data-testid="doc">{editor.text}</pre>
      <button type="button" data-testid="undo" onClick={editor.undo}>
        undo
      </button>
    </I18nProvider>
  );
}

const doc = () => screen.getByTestId('doc').textContent ?? '';
const state = () => screen.getByLabelText('Tick') as HTMLSelectElement;

describe('switching between the three states', () => {
  it('binds, then comes back to the blank box, each in ONE undo step', () => {
    render(<Harness />);
    fireEvent.change(state(), { target: { value: 'bound' } });
    expect(doc()).toContain('data:');
    fireEvent.change(state(), { target: { value: 'off' } });
    expect(doc()).not.toContain('data:');
    expect(doc()).not.toContain('checked');
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).toContain('data:');
  });

  it('comes back TICKED, dropping the binding in the same step', () => {
    render(<Harness />);
    fireEvent.change(state(), { target: { value: 'bound' } });
    fireEvent.change(state(), { target: { value: 'on' } });
    expect(doc()).toContain('checked: true');
    expect(doc()).not.toContain('data:');
    // One step back is the bound form again, not a half-switched document.
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).toContain('data:');
    expect(doc()).not.toContain('checked');
  });

  it('unticks by REMOVING the key rather than writing false', () => {
    render(<Harness />);
    fireEvent.change(state(), { target: { value: 'on' } });
    fireEvent.change(state(), { target: { value: 'off' } });
    expect(doc()).not.toContain('checked');
  });
});

describe('the bound arm', () => {
  function bind() {
    render(<Harness />);
    fireEvent.change(state(), { target: { value: 'bound' } });
  }

  it('commits a typed key', () => {
    bind();
    fireEvent.blur(screen.getByLabelText('Data field'), { target: { value: 'agreed' } });
    expect(doc()).toContain('key: agreed');
  });

  it('drops a stale `equals` in the same step as a repoint to a boolean field', () => {
    // A boolean-form field renders no value control, so a kept `equals` would
    // be invisible AND still override the boolean read.
    bind();
    fireEvent.blur(screen.getByLabelText('Data field'), { target: { value: 'method' } });
    fireEvent.change(screen.getByLabelText('Ticked when the value is'), {
      target: { value: 'card' },
    });
    expect(doc()).toContain('equals: card');
    fireEvent.blur(screen.getByLabelText('Data field'), { target: { value: 'agreed' } });
    expect(doc()).not.toContain('equals');
  });

  it('takes a TYPED key the schema does not offer, and an untyped `equals` with it', () => {
    // Typing stays open — narrowing what is OFFERED never rewrites what may be
    // AUTHORED — so the repoint has to work with no matching option to read a
    // type or an enum from.
    bind();
    fireEvent.blur(screen.getByLabelText('Data field'), { target: { value: 'unlisted' } });
    expect(doc()).toContain('key: unlisted');
    fireEvent.blur(screen.getByLabelText('Ticked when the value is'), { target: { value: '7' } });
    // A string, not a number: nothing declares `unlisted` as numeric, so
    // coercing it would be a guess the engine then type-mismatches on.
    expect(doc()).toMatch(/equals:\s*['"]?7['"]?/);
  });

  it('authors a NUMBER for a numeric field, so the type-strict predicate can match', () => {
    bind();
    fireEvent.blur(screen.getByLabelText('Data field'), { target: { value: 'count' } });
    fireEvent.blur(screen.getByLabelText('Ticked when the value is'), { target: { value: '2' } });
    expect(doc()).toMatch(/equals:\s*2\s*$/m);
  });
});

describe('inside a row scope', () => {
  it('applies a ROW-scope pick to the real document, rather than refusing the batch', () => {
    // The end-to-end half of the guard: an element-scope pick used to push a
    // `removeKey` for a `data.scope` that is not there, which returns
    // `key_not_found` and makes `applyAll` restore the pre-batch document — so
    // the whole pick, the `data.key` write included, silently did nothing.
    render(<Harness scope="rows" capabilities={['binding.scope']} />);
    fireEvent.change(state(), { target: { value: 'bound' } });
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Agreed/ }));
    expect(doc()).toContain('key: agreed');
    expect(doc()).not.toContain('scope:');
  });

  it('offers the top-level fields as a second section and writes the scope with the pick', () => {
    // Picking a TOP-LEVEL field without `scope: document` authors a key that
    // resolves against the element and finds nothing — the mark then never
    // draws, with no diagnostic to say why.
    render(<Harness scope="rows" capabilities={['binding.scope']} />);
    fireEvent.change(state(), { target: { value: 'bound' } });
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Paid/ }));
    expect(doc()).toContain('key: paid');
    expect(doc()).toContain('scope: document');
  });
});
