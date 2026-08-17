// The `visible:` editor as rendered. The capability gate is tested through
// `ItemPanel` rather than here, because the pure-model test leaves the prop
// THREADING unpinned and a dropped `capabilities` prop fails open silently.

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import type { PickerOption } from './pickerModel';
import { VisibilitySection } from './VisibilitySection';

const P = 'sections.body.items[0]';

const OPTIONS: readonly PickerOption[] = [
  {
    key: 'status',
    label: 'Status',
    type: 'string',
    sample: 'approved',
    enumValues: ['approved', 'draft'],
  },
  { key: 'paid', label: 'Paid', type: 'boolean', sample: 'true', enumValues: [] },
];

function makeController(item: unknown, apply = vi.fn(() => ({ ok: true as const }))) {
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply,
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: (path: string) => (path === P ? item : undefined),
    undo: vi.fn(),
    redo: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setMaxBytes: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceDocument: vi.fn(),
  } as unknown as EditorController;
}

function draw(node: ReactElement) {
  return render(<I18nProvider locale="en">{node}</I18nProvider>);
}

describe('with no binding authored', () => {
  it('offers to add one and writes the seed op', () => {
    const apply = vi.fn(() => ({ ok: true as const }));
    const controller = makeController({ type: 'text' }, apply);
    draw(<VisibilitySection path={P} controller={controller} options={OPTIONS} itemType="text" />);

    fireEvent.click(screen.getByRole('button', { name: 'Show conditionally' }));
    expect(apply).toHaveBeenCalledWith({
      op: 'putValue',
      path: P,
      keys: ['visible'],
      value: { key: '' },
    });
  });
});

describe('with a binding authored', () => {
  it('renders the enum value control for an enum field', () => {
    const controller = makeController({ visible: { key: 'status', equals: 'approved' } });
    draw(<VisibilitySection path={P} controller={controller} options={OPTIONS} itemType="text" />);
    expect(screen.getByLabelText('Shown when the value is')).toBeTruthy();
  });

  it('renders NO value control for a boolean field', () => {
    // The wire omits `equals` in the boolean form, so a control would author
    // a key that changes what the predicate means.
    const controller = makeController({ visible: { key: 'paid' } });
    draw(<VisibilitySection path={P} controller={controller} options={OPTIONS} itemType="text" />);
    expect(screen.queryByLabelText('Shown when the value is')).toBeNull();
  });

  it('turns collapse on with one op and OFF by removing the key', () => {
    const apply = vi.fn(() => ({ ok: true as const }));
    const off = makeController({ visible: { key: 'paid' } }, apply);
    const view = draw(
      <VisibilitySection path={P} controller={off} options={OPTIONS} itemType="text" />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: P,
      keys: ['visible', 'collapse'],
      value: true,
    });

    view.unmount();
    const apply2 = vi.fn(() => ({ ok: true as const }));
    const on = makeController({ visible: { key: 'paid', collapse: true } }, apply2);
    draw(<VisibilitySection path={P} controller={on} options={OPTIONS} itemType="text" />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(apply2).toHaveBeenCalledWith({
      op: 'removeKey',
      path: P,
      keys: ['visible', 'collapse'],
    });
  });

  it('explains which semantic is in force', () => {
    const off = makeController({ visible: { key: 'paid' } });
    const view = draw(
      <VisibilitySection path={P} controller={off} options={OPTIONS} itemType="text" />,
    );
    expect(screen.getByText(/keeps its space/)).toBeTruthy();
    view.unmount();

    const on = makeController({ visible: { key: 'paid', collapse: true } });
    draw(<VisibilitySection path={P} controller={on} options={OPTIONS} itemType="text" />);
    expect(screen.getByText(/move up/)).toBeTruthy();
  });

  it('reports a `scope: document` binding it cannot edit', () => {
    const controller = makeController({ visible: { key: 'paid', scope: 'document' } });
    draw(<VisibilitySection path={P} controller={controller} options={OPTIONS} itemType="text" />);
    expect(screen.getByText(/top-level data/)).toBeTruthy();
  });

  it('does not claim a document scope the wire does not carry', () => {
    const controller = makeController({ visible: { key: 'paid' } });
    draw(<VisibilitySection path={P} controller={controller} options={OPTIONS} itemType="text" />);
    expect(screen.queryByText(/top-level data/)).toBeNull();
  });

  it('removes the binding so the item always draws again', () => {
    const apply = vi.fn(() => ({ ok: true as const }));
    const controller = makeController({ visible: { key: 'paid' } }, apply);
    draw(<VisibilitySection path={P} controller={controller} options={OPTIONS} itemType="text" />);
    fireEvent.click(screen.getByRole('button', { name: 'Always show' }));
    expect(apply).toHaveBeenCalledWith({ op: 'removeKey', path: P, keys: ['visible'] });
  });

  it('repoints at another field as ONE transactional batch', () => {
    const controller = makeController({ visible: { key: 'status', equals: 'approved' } });
    draw(<VisibilitySection path={P} controller={controller} options={OPTIONS} itemType="text" />);
    const key = screen.getByLabelText('Field') as HTMLInputElement;
    fireEvent.blur(key, { target: { value: 'paid' } });
    // Repointing at a BOOLEAN field hides the value control, so the stale
    // `equals` must go in the same batch — one undo step, and no key left
    // overriding the boolean read invisibly.
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: P, keys: ['visible', 'key'], value: 'paid' },
      { op: 'removeKey', path: P, keys: ['visible', 'equals'] },
    ]);
  });

  it('repoints at a value-carrying field with only the key write', () => {
    const controller = makeController({ visible: { key: 'paid' } });
    draw(<VisibilitySection path={P} controller={controller} options={OPTIONS} itemType="text" />);
    const key = screen.getByLabelText('Field') as HTMLInputElement;
    fireEvent.blur(key, { target: { value: 'status' } });
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: P, keys: ['visible', 'key'], value: 'status' },
    ]);
  });

  it('repoints at an UNKNOWN key without pretending to know its type', () => {
    const controller = makeController({ visible: { key: 'status', equals: 'approved' } });
    draw(<VisibilitySection path={P} controller={controller} options={OPTIONS} itemType="text" />);
    const key = screen.getByLabelText('Field') as HTMLInputElement;
    fireEvent.blur(key, { target: { value: 'not.declared' } });
    // No option matches, so no field type is claimed and the `equals` stays —
    // the engine reports the unknown key, which is the honest answer.
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: P, keys: ['visible', 'key'], value: 'not.declared' },
    ]);
  });

  it('renders a binding whose key matches no declared field', () => {
    // An externally-authored document can name a key the definitions do not
    // declare. The panel must still show it — the engine reports the unknown
    // key, and hiding the row would make the file unreadable in the UI.
    const apply = vi.fn(() => ({ ok: true as const }));
    const controller = makeController({ visible: { key: 'legacy.flag', equals: 'y' } }, apply);
    draw(<VisibilitySection path={P} controller={controller} options={OPTIONS} itemType="text" />);
    const value = screen.getByLabelText('Shown when the value is') as HTMLInputElement;
    expect(value.value).toBe('y');
    // With no matching option there is no field TYPE to claim, so the write
    // takes the value verbatim rather than guessing a numeric literal.
    fireEvent.blur(value, { target: { value: '7' } });
    expect(apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: P,
      keys: ['visible', 'equals'],
      value: '7',
    });
  });

  it('sets a typed `equals` through the value control', () => {
    const apply = vi.fn(() => ({ ok: true as const }));
    const controller = makeController({ visible: { key: 'status', equals: 'draft' } }, apply);
    draw(<VisibilitySection path={P} controller={controller} options={OPTIONS} itemType="text" />);
    fireEvent.change(screen.getByLabelText('Shown when the value is'), {
      target: { value: 'approved' },
    });
    expect(apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: P,
      keys: ['visible', 'equals'],
      value: 'approved',
    });
  });
});

describe('inside a row scope, with both scopes offered', () => {
  const ROW: readonly PickerOption[] = [
    { key: 'name', label: 'Name', type: 'string', sample: 'Ada', enumValues: [] },
  ];

  it('commits a TOP-LEVEL pick with `scope: document` in the same batch', () => {
    // The defect this pins: picking a document field and writing only the key
    // leaves the binding resolving against the bound ELEMENT, where the key
    // does not exist — the item then vanishes with no diagnostic at all.
    const controller = makeController({ visible: { key: 'name' } });
    draw(
      <VisibilitySection
        path={P}
        controller={controller}
        options={ROW}
        documentOptions={OPTIONS}
        itemType="text"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Paid/ }));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: P, keys: ['visible', 'key'], value: 'paid' },
      { op: 'setScalar', path: P, keys: ['visible', 'scope'], value: 'document' },
    ]);
  });

  it('commits a ROW pick by removing the scope key', () => {
    const controller = makeController({ visible: { key: 'paid', scope: 'document' } });
    draw(
      <VisibilitySection
        path={P}
        controller={controller}
        options={ROW}
        documentOptions={OPTIONS}
        itemType="text"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Name/ }));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: P, keys: ['visible', 'key'], value: 'name' },
      { op: 'removeKey', path: P, keys: ['visible', 'scope'] },
    ]);
  });

  it('resolves the value control against the DOCUMENT list too', () => {
    // `picked` must search both sections, or a document-scoped enum field
    // would render free entry instead of its select.
    const controller = makeController({
      visible: { key: 'status', equals: 'approved', scope: 'document' },
    });
    draw(
      <VisibilitySection
        path={P}
        controller={controller}
        options={ROW}
        documentOptions={OPTIONS}
        itemType="text"
      />,
    );
    const value = screen.getByLabelText('Shown when the value is');
    expect(value.tagName).toBe('SELECT');
  });
});

describe('a page_break', () => {
  it('gets no collapse control and copy that matches what the engine does', () => {
    // The engine ALWAYS removes a page_break whose predicate fails — it
    // reserves no box — so a collapse checkbox would do nothing, and the
    // default explanation ("keeps its space") states the opposite.
    const controller = makeController({ visible: { key: 'paid' } });
    draw(
      <VisibilitySection
        path={P}
        controller={controller}
        options={OPTIONS}
        itemType="page_break"
      />,
    );
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(/keeps its space/)).toBeNull();
    expect(screen.getByText(/does not happen/)).toBeTruthy();
  });

  it('keeps the collapse control for an ordinary item', () => {
    const controller = makeController({ visible: { key: 'paid' } });
    draw(<VisibilitySection path={P} controller={controller} options={OPTIONS} itemType="text" />);
    expect(screen.getByRole('checkbox')).toBeTruthy();
    expect(screen.queryByText(/does not happen/)).toBeNull();
  });
});
