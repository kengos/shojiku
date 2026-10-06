// The two form marks as the panel renders them, driven through PropertyPanel:
// the tab set, the presence control, the uniform paint cluster, and the
// ellipse's anchor. The pure models are pinned beside this file; what these
// tests add is the prop THREADING — a dropped `capabilities` prop fails open
// silently, and a section that is never mounted is invisible to a model test.

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { readItemView } from './itemView';
import { PropertyPanel } from './PropertyPanel';
import { applicableTabs } from './panelTabs';

const PATH = 'sections.body.items[0]';

const CAPS = ['ellipse', 'checkbox', 'ellipse.anchor', 'style.backgroundColor', 'style.border'];

function makeController(reads: Record<string, unknown>, overrides: Partial<EditorController> = {}) {
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: (path: string) => reads[path],
    undo: vi.fn(),
    redo: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setMaxBytes: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceDocument: vi.fn(),
    ...overrides,
  } as EditorController;
}

function draw(node: ReactElement) {
  return render(<I18nProvider locale="en">{node}</I18nProvider>);
}

/** The anchor picker reads the DOCUMENT (`sections`), never a box index — so
 * the reads carry the ellipse and two OTHER named items: re-pointing an
 * already-anchored oval needs somewhere else to point. */
const TARGETS = [
  { type: 'text', id: 'total' },
  { type: 'rect', id: 'subtotal' },
];

function withDoc(
  item: Record<string, unknown>,
  others: readonly Record<string, unknown>[] = TARGETS,
): Record<string, unknown> {
  return { [PATH]: item, sections: { body: { type: 'flow', items: [item, ...others] } } };
}

/** The option key `AnchorTargetSelect` gives the body item at `index`. */
const key = (index: number) => `p:sections.body.items[${index}]`;

function panel(
  item: Record<string, unknown>,
  opts: {
    capabilities?: readonly string[];
    controller?: EditorController;
  } = {},
) {
  const controller = opts.controller ?? makeController(withDoc(item));
  draw(
    <PropertyPanel controller={controller} path={PATH} capabilities={opts.capabilities ?? CAPS} />,
  );
  return controller;
}

function tabsOf(item: Record<string, unknown>): readonly string[] {
  const view = readItemView(item);
  if (view === null) {
    throw new Error('fixture must be a readable item view');
  }
  return applicableTabs(view);
}

describe('the tab set', () => {
  it('gives both marks all three tabs', () => {
    // Their content is their PRESENCE — the engine's own word for it — so a
    // mark with no content tab could be moved and painted but never bound.
    expect(tabsOf({ type: 'ellipse', box: { w: 60, h: 40 } })).toEqual(['content', 'style', 'box']);
    expect(tabsOf({ type: 'checkbox' })).toEqual(['content', 'style', 'box']);
  });
});

describe('the presence control', () => {
  it('offers an ellipse two states and a checkbox three', () => {
    panel({ type: 'ellipse', box: { w: 60, h: 40 } });
    const ellipse = screen.getByRole('combobox', { name: 'When it draws' });
    expect([...ellipse.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Always',
      'From the data',
    ]);
  });

  it('says TICKED, not DRAWN, on a checkbox’s bound value — the frame always draws', () => {
    // The engine calls the frame chrome and the check content, so a binding
    // there decides the tick. One shared string said "draws when…" over a
    // control that does nothing of the sort.
    panel({ type: 'checkbox', data: { key: 'agreed', equals: 'y' } });
    expect(screen.getByLabelText('Ticked when the value is')).toBeTruthy();
    panel({ type: 'ellipse', data: { key: 'agreed', equals: 'y' }, box: { w: 6, h: 4 } });
    expect(screen.getByLabelText('Draws when the value is')).toBeTruthy();
  });

  it('offers a checkbox the ticked state an ellipse has no wire for', () => {
    panel({ type: 'checkbox' });
    const box = screen.getByRole('combobox', { name: 'Tick' });
    expect([...box.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Blank',
      'Ticked',
      'From the data',
    ]);
  });

  it('ticks a checkbox in one batch', () => {
    const controller = panel({ type: 'checkbox' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Tick' }), { target: { value: 'on' } });
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: PATH, keys: ['checked'], value: true },
    ]);
  });

  it('drops `checked` in the SAME batch when switching to the data', () => {
    const controller = panel({ type: 'checkbox', checked: true });
    fireEvent.change(screen.getByRole('combobox', { name: 'Tick' }), {
      target: { value: 'bound' },
    });
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'putValue', path: PATH, keys: ['data'], value: { key: '' } },
      { op: 'removeKey', path: PATH, keys: ['checked'] },
    ]);
  });

  it('authors NOTHING when the current state is re-picked', () => {
    // A no-op that dispatched would still mint an undo step (`applyAll([])`
    // reports ok and bumps the revision), so the guard has to be here.
    const controller = panel({ type: 'checkbox' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Tick' }), { target: { value: 'off' } });
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('reports an authored `data.scope` rather than hiding what the file says', () => {
    // The panel does not EDIT the scope escape — it is an authoring-level
    // choice — so silently not showing it would misdescribe the document.
    panel({ type: 'ellipse', data: { key: 'method', scope: 'document' }, box: { w: 6, h: 4 } });
    expect(screen.getByText('Reads a top-level field, not this row.')).toBeTruthy();
  });

  it('shows no binding controls at all in the static state', () => {
    panel({ type: 'ellipse', box: { w: 6, h: 4 } });
    expect(screen.queryByLabelText('Data field')).toBeNull();
    expect(screen.queryByText('Reads a top-level field, not this row.')).toBeNull();
  });

  it('ignores a stray `checked` on an ELLIPSE, which has no such wire key', () => {
    // A parse error the engine rejects — but the panel is where you come to fix
    // one, and echoing it back would drive the two-row select to a value it has
    // no option for and show nothing selected.
    panel({ type: 'ellipse', checked: true, box: { w: 6, h: 4 } });
    const select = screen.getByRole('combobox', { name: 'When it draws' }) as HTMLSelectElement;
    expect(select.value).toBe('off');
    expect([...select.querySelectorAll('option')].map((o) => o.value)).toEqual(['off', 'bound']);
    // …and the checkbox-only conflict note stays off it too.
    expect(screen.queryByText(/tick AND binds/)).toBeNull();
  });

  it('reports a checked + bound document as a conflict rather than hiding one', () => {
    panel({ type: 'checkbox', checked: true, data: { key: 'x' } });
    expect(
      screen.getByText('This item sets a tick AND binds one. The data wins; clear one of them.'),
    ).toBeTruthy();
  });
});

describe('the paint cluster', () => {
  function openStyle() {
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
  }

  it('gives a mark the uniform outline, NOT the per-side border editor', () => {
    // The border editor authors three things a shape does not take: a per-side
    // map (`shape_border_sides_ignored`), a corner radius
    // (`border_radius_ignored`), and a `borderStyle`, which is silently inert.
    // Only the first two are assertable — nothing reports the third.
    panel({ type: 'ellipse', box: { w: 60, h: 40 } });
    openStyle();
    expect(screen.getByText('Outline')).toBeTruthy();
    expect(screen.queryByText('Border')).toBeNull();
    expect(screen.queryByLabelText('Corner radius')).toBeNull();
  });

  it('commits a typed width as a parsed number', () => {
    const controller = panel({ type: 'checkbox' });
    openStyle();
    const width = screen.getByRole('textbox', { name: 'Line width' });
    fireEvent.blur(width, { target: { value: '2.5' } });
    // ONE op = one undo step, dispatched through the panel's shared guard.
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['style', 'borderWidth'],
      value: 2.5,
    });
  });

  it('authors NOTHING for a refused width, so the field can reseed', () => {
    // A refused entry never moves the value, which would otherwise strand the
    // typed number on screen over a document that never took it.
    const controller = panel({ type: 'checkbox' });
    openStyle();
    fireEvent.blur(screen.getByRole('textbox', { name: 'Line width' }), {
      target: { value: 'wide' },
    });
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('names the style a width came from', () => {
    const controller = makeController({
      [PATH]: { type: 'ellipse', styleNames: ['stamp'], box: { w: 6, h: 4 } },
      styles: { stamp: { borderWidth: 3 } },
    });
    panel({ type: 'ellipse' }, { controller });
    openStyle();
    expect(screen.getByText('Width comes from the style “stamp”.')).toBeTruthy();
  });
});

describe('the ellipse anchor', () => {
  function openPlacement() {
    fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));
  }

  it('offers the document’s items — no preview needed — and attaches in one batch', () => {
    // No geometry is passed at all: the list must not wait on a render.
    const item = { type: 'ellipse', box: { x: 5, y: 8, w: 6, h: 4 } };
    const controller = makeController(withDoc(item));
    panel(item, { controller });
    openPlacement();
    const select = screen.getByRole('combobox', { name: 'Circle an item' }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'Choose an item…',
      'total (Text)',
      'subtotal (Rectangle)',
    ]);
    fireEvent.change(select, { target: { value: key(1) } });
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: PATH, keys: ['anchor'], value: 'total' },
      { op: 'removeKey', path: PATH, keys: ['box', 'x'] },
      { op: 'removeKey', path: PATH, keys: ['box', 'y'] },
    ]);
  });

  it('names an UNNAMED target in the same batch as the anchor', () => {
    const item = { type: 'ellipse', box: { x: 5, w: 6, h: 4 } };
    const controller = makeController(
      withDoc(item, [{ type: 'text', data: { key: 'order.total' } }]),
    );
    panel(item, { controller });
    openPlacement();
    const select = screen.getByRole('combobox', { name: 'Circle an item' }) as HTMLSelectElement;
    expect(select.options[1]?.textContent).toBe('order.total (Text)');
    fireEvent.change(select, { target: { value: key(1) } });
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: key(1).slice(2), keys: ['id'], value: 'order_total' },
      { op: 'setScalar', path: PATH, keys: ['anchor'], value: 'order_total' },
      { op: 'removeKey', path: PATH, keys: ['box', 'x'] },
    ]);
  });

  it('withholds the coordinate fields while anchored, keeping the size', () => {
    // The engine reads neither `box.x` nor `box.y` for an anchored ellipse, so
    // an editable coordinate would be a control with no effect.
    panel({ type: 'ellipse', anchor: 'total', box: { w: 60, h: 40 } });
    openPlacement();
    expect(screen.queryByRole('textbox', { name: 'X' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Y' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Width' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Height' })).toBeTruthy();
    // …and it SAYS so, rather than leaving the reader to notice two missing
    // fields: the panel repeats in words what `canvas/manipulate` enforces.
    expect(
      screen.getByText('Position follows that item; the size below is still yours.'),
    ).toBeTruthy();
  });

  it('withholds the OFFER against an engine that has no `ellipse.anchor`', () => {
    // An older engine parse-REJECTS `anchor:`, so the offer must not be made
    // hopefully.
    panel({ type: 'ellipse', box: { w: 6, h: 4 } }, { capabilities: ['ellipse'] });
    openPlacement();
    expect(screen.queryByRole('combobox', { name: 'Circle an item' })).toBeNull();
  });

  it('still shows — and can detach — a file that already carries an anchor', () => {
    // The gate is on the OFFER, never on the reading: a document the panel
    // cannot describe is worse than one it cannot extend.
    panel({ type: 'ellipse', anchor: 'total', box: { w: 6, h: 4 } }, { capabilities: ['ellipse'] });
    openPlacement();
    expect(screen.getByRole('combobox', { name: 'Circling' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Place it myself' })).toBeTruthy();
  });

  it('offers neither a page_break nor an item inside a repeat cell', () => {
    // A page_break places no box, and an item in a repeat cell is placed once
    // per row — an anchor would only ever find the first.
    const item = { type: 'ellipse', box: { w: 6, h: 4 } };
    panel(item, {
      controller: makeController(
        withDoc(item, [
          { type: 'page_break' },
          { type: 'repeat', cell: { items: [{ type: 'text', id: 'row' }] } },
        ]),
      ),
    });
    openPlacement();
    const select = screen.getByRole('combobox', { name: 'Circle an item' }) as HTMLSelectElement;
    // The repeat ITSELF is one placement, so it is offered; nothing else is.
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'Choose an item…',
      'Repeat grid',
    ]);
  });

  it('keeps the row VISIBLE and disabled, with its reason, when nothing can be circled', () => {
    // The band-only page-number rule: a control that appears and disappears
    // reads as a bug, and a bare sentence with no control reads as one too.
    const item = { type: 'ellipse', box: { w: 6, h: 4 } };
    panel(item, { controller: makeController(withDoc(item, [])) });
    openPlacement();
    const select = screen.getByRole('combobox', { name: 'Circle an item' }) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(select.textContent).toBe('No items to circle');
  });

  it('keeps an unlisted target selectable, so an edit never re-points the oval', () => {
    panel({ type: 'ellipse', anchor: 'gone', box: { w: 6, h: 4 } });
    openPlacement();
    const select = screen.getByRole('combobox', { name: 'Circling' }) as HTMLSelectElement;
    expect(select.value).toBe('v:gone');
    expect([...select.options].map((o) => o.value)).toEqual([key(1), key(2), 'v:gone']);
    // No node carries `gone`: the anchor draws nothing, and the option says so.
    expect(select.selectedOptions[0]?.textContent).toBe('gone (not found)');
  });

  it('shows a target a node DOES carry, but the list leaves out, as written', () => {
    // `row` sits in a repeat cell — not offered, yet not missing either.
    const item = { type: 'ellipse', anchor: 'row', box: { w: 6, h: 4 } };
    panel(item, {
      controller: makeController(
        withDoc(item, [{ type: 'repeat', cell: { items: [{ type: 'text', id: 'row' }] } }]),
      ),
    });
    openPlacement();
    const select = screen.getByRole('combobox', { name: 'Circling' }) as HTMLSelectElement;
    expect(select.selectedOptions[0]?.textContent).toBe('row');
  });

  it('never calls a target missing when the document cannot be read whole', () => {
    // A partial namespace cannot prove an id absent.
    const item = { type: 'ellipse', anchor: 'gone', box: { w: 6, h: 4 } };
    const controller = makeController({ [PATH]: item });
    panel(item, {
      controller: {
        ...controller,
        read: (path: string) => {
          if (path === 'sections') {
            throw new Error('over the materialization cap');
          }
          return controller.read(path);
        },
      },
    });
    openPlacement();
    const select = screen.getByRole('combobox', { name: 'Circling' }) as HTMLSelectElement;
    expect(select.selectedOptions[0]?.textContent).toBe('gone');
  });

  it('never offers the oval ITSELF as a target', () => {
    // A self-anchor resolves to nothing: an anchored item is deferred, so it
    // is absent from the index the engine resolves against.
    panel({ type: 'ellipse', id: 'oval', box: { w: 6, h: 4 } });
    openPlacement();
    const select = screen.getByRole('combobox', { name: 'Circle an item' }) as HTMLSelectElement;
    const values = [...select.options].map((o) => o.value);
    expect(values).toContain(key(1));
    expect(values).not.toContain(key(0));
  });

  it('re-points an already-anchored oval without touching anything else', () => {
    // Its `box.x`/`box.y` are already gone (attaching dropped them), so the
    // switch is the anchor key alone — and removing a coordinate that is not
    // there would refuse the whole batch.
    const item = { type: 'ellipse', anchor: 'total', box: { w: 6, h: 4 } };
    const controller = makeController(withDoc(item));
    panel(item, { controller });
    openPlacement();
    fireEvent.change(screen.getByRole('combobox', { name: 'Circling' }), {
      target: { value: key(2) },
    });
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: PATH, keys: ['anchor'], value: 'subtotal' },
    ]);
  });

  it('detaches by removing the key alone', () => {
    const item = { type: 'ellipse', anchor: 'total', box: { w: 6, h: 4 } };
    const controller = makeController(withDoc(item));
    panel(item, { controller });
    openPlacement();
    fireEvent.click(screen.getByRole('button', { name: 'Place it myself' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: PATH,
      keys: ['anchor'],
    });
  });

  it('draws a hostile id CLIPPED while keeping the pickable value exact', () => {
    // Display and round-trip are different contracts: a clipped value would
    // author a truncated id the engine cannot resolve.
    const long = 'a'.repeat(200);
    panel({ type: 'ellipse', anchor: long, box: { w: 6, h: 4 } });
    openPlacement();
    const select = screen.getByRole('combobox', { name: 'Circling' }) as HTMLSelectElement;
    const option = [...select.options].find((o) => o.value === `v:${long}`);
    expect(option?.textContent).toBe(`${'a'.repeat(80)}… (not found)`);
  });

  it('clips a hostile LABEL too', () => {
    const item = { type: 'ellipse', box: { w: 6, h: 4 } };
    panel(item, {
      controller: makeController(withDoc(item, [{ type: 'text', text: 'w'.repeat(10_000) }])),
    });
    openPlacement();
    const select = screen.getByRole('combobox', { name: 'Circle an item' }) as HTMLSelectElement;
    // The LABEL is clipped, so the kind survives.
    const text = select.options[1]?.textContent ?? '';
    expect(text.endsWith('… (Text)')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(81 + ' (Text)'.length);
  });

  it('groups the offer by section, as the layer tree does, once there is more than one', () => {
    const item = { type: 'ellipse', box: { w: 6, h: 4 } };
    const reads = withDoc(item);
    (reads.sections as Record<string, unknown>).header = { items: [{ type: 'text', id: 'title' }] };
    panel(item, { controller: makeController(reads) });
    openPlacement();
    const select = screen.getByRole('combobox', { name: 'Circle an item' }) as HTMLSelectElement;
    expect([...select.querySelectorAll('optgroup')].map((g) => g.label)).toEqual([
      'Header',
      'Body',
    ]);
  });

  it('never offers the anchor on a checkbox — the wire has no such key', () => {
    panel({ type: 'checkbox' });
    openPlacement();
    expect(screen.queryByRole('combobox', { name: 'Circle an item' })).toBeNull();
  });
});

describe('the ellipse anchor against a real editor', () => {
  function Harness({ source }: { readonly source: string }) {
    const editor = useEditor(source);
    return (
      <I18nProvider locale="en">
        <PropertyPanel controller={editor} path={PATH} capabilities={CAPS} />
        <pre data-testid="doc">{editor.text}</pre>
        <button type="button" data-testid="undo" onClick={editor.undo}>
          undo
        </button>
      </I18nProvider>
    );
  }

  it('names the target and anchors to it in ONE undo step', () => {
    render(
      <Harness
        source={`sections:
  body:
    type: absolute
    items:
      - { type: ellipse, box: { x: 4, y: 4, w: 6, h: 4 } }
      - { type: text, text: Yes, box: { x: 0, y: 20, w: 40, h: 10 } }
`}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Circle an item' }), {
      target: { value: key(1) },
    });
    const doc = () => screen.getByTestId('doc').textContent ?? '';
    expect(doc()).toContain('id: text_1');
    expect(doc()).toContain('anchor: text_1');
    expect(doc()).not.toContain('x: 4');
    // …and says so, once: the name landed on an item the user is not looking at.
    expect(screen.getByRole('status').textContent).toBe(
      'Named that item “text_1” so this can follow it.',
    );
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).not.toContain('text_1');
    expect(doc()).toContain('x: 4');
    // Undone, the note would be false — it goes with it.
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says nothing when the target already had a name', () => {
    render(
      <Harness
        source={`sections:
  body:
    type: absolute
    items:
      - { type: ellipse, box: { w: 6, h: 4 } }
      - { type: text, id: yes, text: Yes }
`}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Circle an item' }), {
      target: { value: key(1) },
    });
    expect(screen.getByTestId('doc').textContent).toContain('anchor: yes');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
