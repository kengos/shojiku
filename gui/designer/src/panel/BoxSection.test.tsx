// The 配置 tab's 自動/固定 placement modes, driven through PropertyPanel — the
// tab body is reachable on its own (`BoxSection.tsx`), but the props it takes
// are the panel's whole contract, so the router is still the honest entry
// point. A mock controller pins op-dispatch assertions; a real `useEditor`
// harness proves the single-undo-step round trip.

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { useEditor } from '../editor/useEditor';
import type { BoxRect, PlacedBox } from '../engine/types';
import { I18nProvider } from '../i18n/context';
import { unitHintsFor } from '../testkit/unitHint';
import { PropertyPanel } from './PropertyPanel';
import type { PlacementGeometry } from './placementGeometry';

function makeController(
  reads: Record<string, unknown>,
  overrides: Partial<EditorController> = {},
): EditorController {
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
  };
}

function draw(node: ReactElement) {
  return render(<I18nProvider locale="en">{node}</I18nProvider>);
}

function openLayout() {
  fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));
}

const radio = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement;

function rect(x: number, y: number, w: number, h: number): BoxRect {
  return { x, y, w, h };
}

function placed(path: string, border: BoxRect, content: BoxRect): PlacedBox {
  return { path, border, content };
}

function geo(boxes: readonly PlacedBox[], fresh = true): PlacementGeometry {
  return { boxes: { pages: [boxes] }, margin: [0, 0, 0, 0], fresh };
}

const OWNER = 'sections.body.items[0]';
const CHILD = 'sections.body.items[0].items[0]';

/** A flex container + one child, with owner content at (10,10) and the child's
 * border at (40,15,60,30) → parent-relative authored (30,5). */
function containerReads(childBox: Record<string, unknown>): Record<string, unknown> {
  return {
    [OWNER]: { type: 'container', box: {} },
    [CHILD]: { type: 'text', text: 'hi', style: {}, box: childBox },
  };
}
function containerGeo(fresh = true): PlacementGeometry {
  return geo(
    [
      placed(OWNER, rect(0, 0, 300, 60), rect(10, 10, 280, 40)),
      placed(CHILD, rect(40, 15, 60, 30), rect(40, 15, 60, 30)),
    ],
    fresh,
  );
}

describe('BoxSection — pinnable (container child)', () => {
  it('shows 自動 active with read-only parent-relative x/y and seeded w/h', () => {
    const controller = makeController(containerReads({}));
    draw(<PropertyPanel controller={controller} path={CHILD} geometry={containerGeo()} />);
    openLayout();
    expect(radio('Auto').checked).toBe(true);
    expect(radio('Fixed').checked).toBe(false);
    // X/Y are read-only displays (no input control), showing the parent-relative
    // values the pin would write.
    expect(screen.queryByLabelText('X')).toBeNull();
    expect(screen.queryByLabelText('Y')).toBeNull();
    expect(screen.getByText('30')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    // W/H are editable, seeded with the resolved border size.
    expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('60');
    expect((screen.getByLabelText('Height') as HTMLInputElement).value).toBe('30');
  });

  it('pins with ONE applyAll batch of both coordinates', () => {
    const controller = makeController(containerReads({}));
    draw(<PropertyPanel controller={controller} path={CHILD} geometry={containerGeo()} />);
    openLayout();
    fireEvent.click(screen.getByRole('radio', { name: 'Fixed' }));
    expect(controller.applyAll).toHaveBeenCalledExactlyOnceWith([
      { op: 'setScalar', path: CHILD, keys: ['box', 'x'], value: 30 },
      { op: 'setScalar', path: CHILD, keys: ['box', 'y'], value: 5 },
    ]);
  });

  it('unpins with ONE applyAll batch, removing only present coordinates', () => {
    const controller = makeController(containerReads({ x: 30, y: 5 }));
    draw(<PropertyPanel controller={controller} path={CHILD} geometry={containerGeo()} />);
    openLayout();
    // 固定 is active (x/y authored); switching to 自動 releases the pin.
    expect(radio('Fixed').checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Auto' }));
    expect(controller.applyAll).toHaveBeenCalledExactlyOnceWith([
      { op: 'removeKey', path: CHILD, keys: ['box', 'x'] },
      { op: 'removeKey', path: CHILD, keys: ['box', 'y'] },
    ]);
  });

  it('renders four editable fields in 固定 mode', () => {
    const controller = makeController(containerReads({ x: 30, y: 5 }));
    draw(<PropertyPanel controller={controller} path={CHILD} geometry={containerGeo()} />);
    openLayout();
    for (const label of ['X', 'Y', 'Width', 'Height']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('disables 固定 with a why-tooltip when the geometry is stale or absent', () => {
    // No geometry: the pin target is unresolvable, so 固定 is disabled and x/y
    // degrade to editable fallbacks.
    const controller = makeController(containerReads({}));
    draw(<PropertyPanel controller={controller} path={CHILD} geometry={null} />);
    openLayout();
    const pin = radio('Fixed');
    expect(pin.disabled).toBe(true);
    expect(screen.getByText('Available once the layout finishes calculating')).toBeTruthy();
    expect(screen.getByLabelText('X')).toBeTruthy();
  });

  it('disables 固定 while the geometry is STALE, keeping the displays stable', () => {
    const controller = makeController(containerReads({}));
    draw(<PropertyPanel controller={controller} path={CHILD} geometry={containerGeo(false)} />);
    openLayout();
    // The pin never writes stale geometry…
    expect(radio('Fixed').disabled).toBe(true);
    // …but the read-only displays and w/h seeds stay on the last-good values —
    // no field-type flapping (and no value-key remount discarding an
    // in-progress entry) during the render cycle.
    expect(screen.queryByLabelText('X')).toBeNull();
    expect(screen.getByText('30')).toBeTruthy();
    expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('60');
  });
});

describe('BoxSection — pin/unpin undo (real editor)', () => {
  function Harness({ source, path }: { readonly source: string; readonly path: string }) {
    const editor = useEditor(source);
    return (
      <I18nProvider locale="en">
        <PropertyPanel controller={editor} path={path} geometry={containerGeo()} />
        <pre data-testid="doc">{editor.text}</pre>
        <button type="button" data-testid="undo" onClick={editor.undo}>
          undo
        </button>
      </I18nProvider>
    );
  }

  const SOURCE = [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: container',
    '        box: {}',
    '        items:',
    '          - { type: text, text: A }',
    '          - { type: text, text: B }',
    '',
  ].join('\n');

  const doc = () => screen.getByTestId('doc').textContent ?? '';

  it('pins then reverts the pin in ONE undo step, restoring 自動', () => {
    render(<Harness source={SOURCE} path={CHILD} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Fixed' }));
    expect(doc()).toContain('x: 30');
    expect(radio('Fixed').checked).toBe(true);
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).not.toContain('x: 30');
    expect(radio('Auto').checked).toBe(true);
  });

  it('unpins then reverts the release in ONE undo step, restoring 固定', () => {
    const PINNED = SOURCE.replace(
      '- { type: text, text: A }',
      '- { type: text, text: A, box: { x: 30, y: 5 } }',
    );
    render(<Harness source={PINNED} path={CHILD} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));
    expect(radio('Fixed').checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Auto' }));
    expect(doc()).not.toContain('x: 30');
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).toContain('x: 30');
    expect(radio('Fixed').checked).toBe(true);
  });
});

describe('BoxSection — flow / coordinate / plain', () => {
  it('shows no segment, a read-only y, and an editable x for a flow child', () => {
    const reads = {
      'sections.body': { type: 'flow' },
      'sections.body.items[0]': { type: 'text', text: 'hi', style: {}, box: {} },
    };
    const g = geo([
      placed('sections.body.items[0]', rect(30, 110, 200, 24), rect(30, 110, 200, 24)),
    ]);
    draw(
      <PropertyPanel
        controller={makeController(reads)}
        path="sections.body.items[0]"
        geometry={g}
      />,
    );
    openLayout();
    expect(screen.queryByRole('group', { name: 'Placement' })).toBeNull();
    // The editable x offset states its unset meaning (0) as a placeholder.
    const x = screen.getByLabelText('X') as HTMLInputElement;
    expect(x.value).toBe('');
    expect(x.placeholder).toBe('0');
    expect(screen.queryByLabelText('Y')).toBeNull();
    expect(screen.getByText('110')).toBeTruthy();
    // No authored y → no "ignored Y" hint.
    expect(screen.queryByText(/ignored/)).toBeNull();
  });

  it('degrades a flow child y to an editable field while no geometry backs it', () => {
    const reads = {
      'sections.body': { type: 'flow' },
      'sections.body.items[0]': { type: 'text', text: 'hi', style: {}, box: {} },
    };
    draw(
      <PropertyPanel
        controller={makeController(reads)}
        path="sections.body.items[0]"
        geometry={null}
      />,
    );
    openLayout();
    expect(screen.getByLabelText('Y')).toBeTruthy();
  });

  it('shows the ignored-Y hint only when a flow child authors y', () => {
    const reads = {
      'sections.body': { type: 'flow' },
      'sections.body.items[0]': { type: 'text', text: 'hi', style: {}, box: { y: 40 } },
    };
    const g = geo([
      placed('sections.body.items[0]', rect(30, 110, 200, 24), rect(30, 110, 200, 24)),
    ]);
    draw(
      <PropertyPanel
        controller={makeController(reads)}
        path="sections.body.items[0]"
        geometry={g}
      />,
    );
    openLayout();
    expect(screen.getByText(/ignored/)).toBeTruthy();
  });

  it('shows a caption and editable fields (no segment) for a band child', () => {
    const reads = {
      'sections.header': { items: [] },
      'sections.header.items[0]': { type: 'text', text: 'hi', style: {}, box: {} },
    };
    const g = geo([
      placed('sections.header.items[0]', rect(50, 20, 100, 20), rect(50, 20, 100, 20)),
    ]);
    draw(
      <PropertyPanel
        controller={makeController(reads)}
        path="sections.header.items[0]"
        geometry={g}
      />,
    );
    openLayout();
    expect(screen.queryByRole('group', { name: 'Placement' })).toBeNull();
    expect(screen.getByText(/measured from the top-left corner/)).toBeTruthy();
    // Unset coordinates state their meaning (0) as placeholders.
    expect((screen.getByLabelText('X') as HTMLInputElement).placeholder).toBe('0');
    expect((screen.getByLabelText('Y') as HTMLInputElement).placeholder).toBe('0');
  });

  it('shows the same caption and editable fields for an absolute-body child', () => {
    const reads = {
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'text', text: 'hi', style: {}, box: {} },
    };
    const g = geo([placed('sections.body.items[0]', rect(60, 80, 120, 20), rect(60, 80, 120, 20))]);
    draw(
      <PropertyPanel
        controller={makeController(reads)}
        path="sections.body.items[0]"
        geometry={g}
      />,
    );
    openLayout();
    expect(screen.queryByRole('group', { name: 'Placement' })).toBeNull();
    expect(screen.getByText(/measured from the top-left corner/)).toBeTruthy();
    expect((screen.getByLabelText('X') as HTMLInputElement).placeholder).toBe('0');
  });

  it('keeps plain flat fields for a sub-template item', () => {
    const path = 'sections.body.items[0].cell.items[0]';
    const reads = { [path]: { type: 'text', text: 'hi', style: {}, box: { x: 4 } } };
    draw(<PropertyPanel controller={makeController(reads)} path={path} geometry={geo([])} />);
    openLayout();
    expect(screen.queryByRole('group', { name: 'Placement' })).toBeNull();
    for (const label of ['X', 'Y', 'Width', 'Height']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });
});

describe('BoxSection — w/h seed guard', () => {
  it('does not author on a tab-through of a seeded value, but does on a change', () => {
    const controller = makeController(containerReads({}));
    draw(<PropertyPanel controller={controller} path={CHILD} geometry={containerGeo()} />);
    openLayout();
    const width = screen.getByLabelText('Width') as HTMLInputElement;
    // A blur with the seeded value unchanged authors nothing.
    fireEvent.blur(width);
    expect(controller.apply).not.toHaveBeenCalled();
    // A changed value authors it.
    fireEvent.change(width, { target: { value: '80' } });
    fireEvent.blur(width);
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: CHILD,
      keys: ['box', 'w'],
      value: 80,
    });
  });

  it('clears an authored w via an empty commit (removeKey), and steps from the resolved base', () => {
    const controller = makeController(containerReads({}));
    draw(<PropertyPanel controller={controller} path={CHILD} geometry={containerGeo()} />);
    openLayout();
    // The seeded Height is 30; ▲ steps it to 31 (grid off → 1pt).
    const heightUp = screen.getAllByRole('button', { name: 'Increase' });
    // Height's stepper is the last one (X/Y are displays; only W/H have steppers).
    fireEvent.click(heightUp[heightUp.length - 1]);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: CHILD,
      keys: ['box', 'h'],
      value: 31,
    });
  });

  it('clears an authored width via an empty commit', () => {
    const controller = makeController(containerReads({ w: 120 }));
    draw(<PropertyPanel controller={controller} path={CHILD} geometry={containerGeo()} />);
    openLayout();
    const width = screen.getByLabelText('Width') as HTMLInputElement;
    fireEvent.change(width, { target: { value: '' } });
    fireEvent.blur(width);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: CHILD,
      keys: ['box', 'w'],
    });
  });
});

describe('BoxSection — the placement `?` help', () => {
  const bandReads = {
    'sections.header': { items: [] },
    'sections.header.items[0]': { type: 'text', text: 'hi', style: {}, box: {} },
  };

  it('offers the `?` and explains where coordinates are measured FROM', () => {
    draw(
      <PropertyPanel
        controller={makeController(bandReads)}
        path="sections.header.items[0]"
        geometry={geo([])}
      />,
    );
    openLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Where coordinates start' }));
    // The origin half and the why-no-warning half — the two sides of the
    // misconception this cycle exists for.
    expect(screen.getByText(/the outlined rectangle on the page/)).toBeTruthy();
    expect(screen.getByText(/leaves the paper/)).toBeTruthy();
    // A band child IS margin-box framed — the guide the canvas draws is exactly
    // the rectangle its numbers start from, so this arm may say so.
    expect(screen.queryByText(/container this element sits in/)).toBeNull();
  });

  it('names the CONTAINER frame — not the page — on the plain arm', () => {
    // `x`/`y` are an offset from the PARENT BOX ORIGIN (docs/engine/box.md).
    // A sub-template item measures from its cell, so telling it the margin
    // rectangle is its origin would re-create this cycle's own misconception one
    // nesting level down — and the canvas now DRAWS that rectangle.
    const path = 'sections.body.items[0].cell.items[0]';
    draw(
      <PropertyPanel
        controller={makeController({ [path]: { type: 'text', text: 'hi', style: {}, box: {} } })}
        path={path}
        geometry={geo([])}
        // This arm's copy DEFERS the rest to the glossary, so the link is
        // load-bearing here in a way it is not for the page-framed arm.
        onOpenGlossary={() => {}}
      />,
    );
    openLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Where coordinates start' }));
    expect(screen.getByText(/container this element sits in/)).toBeTruthy();
    // It must NOT claim the margin frame — that is the defect this arm exists
    // to avoid, and the canvas is drawing that rectangle right now.
    expect(screen.queryByText(/inside the page margins/)).toBeNull();
    // One sentence: the rest (why the drawn rectangle is not this element's
    // frame, and which bound reports it) lives behind "learn more".
    expect(screen.getByRole('button', { name: 'Learn more' })).toBeTruthy();
  });

  it('names the CONTAINER frame for a container child (pinnable) too', () => {
    const reads = {
      'sections.body.items[0]': { type: 'container', box: { type: 'flex' }, items: [] },
      'sections.body.items[0].items[0]': { type: 'text', text: 'hi', style: {}, box: {} },
    };
    draw(
      <PropertyPanel
        controller={makeController(reads)}
        path="sections.body.items[0].items[0]"
        geometry={geo([])}
      />,
    );
    openLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Where coordinates start' }));
    expect(screen.getByText(/container this element sits in/)).toBeTruthy();
  });

  it('offers "learn more" only when the host can open the glossary', () => {
    const onOpenGlossary = vi.fn();
    const view = draw(
      <PropertyPanel
        controller={makeController(bandReads)}
        path="sections.header.items[0]"
        geometry={geo([])}
        onOpenGlossary={onOpenGlossary}
      />,
    );
    openLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Where coordinates start' }));
    fireEvent.click(screen.getByRole('button', { name: 'Learn more' }));
    expect(onOpenGlossary).toHaveBeenCalled();
    view.unmount();

    draw(
      <PropertyPanel
        controller={makeController(bandReads)}
        path="sections.header.items[0]"
        geometry={geo([])}
      />,
    );
    openLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Where coordinates start' }));
    expect(screen.queryByRole('button', { name: 'Learn more' })).toBeNull();
  });

  it('names the MARGIN box in the coordinate caption, not a bare corner', () => {
    // The shipped copy used to say "measured from the top-left corner", which
    // reads as the PAPER corner and is the wrong frame.
    draw(
      <PropertyPanel
        controller={makeController(bandReads)}
        path="sections.header.items[0]"
        geometry={geo([])}
      />,
    );
    openLayout();
    expect(
      screen.getByText(
        'Here the position is set by coordinates, measured from the top-left corner of the area inside the page margins.',
      ),
    ).toBeTruthy();
  });
});

describe('BoxSection — a relative width', () => {
  const FLOW = 'sections.body.items[0]';
  function flowReads(box: Record<string, unknown>): Record<string, unknown> {
    return { [FLOW]: { type: 'text', text: 'hi', style: {}, box } };
  }

  it('says WHY the ▲▼ are unavailable on a percent value', () => {
    // `100%` is a legal box width the engine resolves at layout, but not one
    // the panel can step by points — and `canvas/lengths` refuses to read it
    // because rewriting it into points would throw the authoring intent away.
    // Before this the buttons just went quiet, which read as a broken field.
    draw(<PropertyPanel controller={makeController(flowReads({ w: '100%' }))} path={FLOW} />);
    openLayout();
    const width = screen.getByLabelText('Width') as HTMLInputElement;
    expect(width.value).toBe('100%');
    const row = width.parentElement?.parentElement as HTMLElement;
    expect(
      (within(row).getByRole('button', { name: 'Increase' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(within(row).getByText(/cannot be stepped/)).not.toBeNull();
  });

  it('shows no such bubble for a value it simply cannot read', () => {
    // `StepperField`'s own prop doc says the caller owns this string because
    // "a message naming percent and em would be a lie over an empty or garbage
    // value". `auto` is legal-looking, unreadable by `canvas/lengths`, and not
    // a relative unit — so the ▲▼ are unavailable and say nothing.
    draw(<PropertyPanel controller={makeController(flowReads({ w: 'auto' }))} path={FLOW} />);
    openLayout();
    const width = screen.getByLabelText('Width') as HTMLInputElement;
    expect(width.value).toBe('auto');
    const row = width.parentElement?.parentElement as HTMLElement;
    expect(
      (within(row).getByRole('button', { name: 'Increase' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(within(row).queryByText(/cannot be stepped/)).toBeNull();
  });

  it('shows no such bubble for a plain pt value', () => {
    draw(<PropertyPanel controller={makeController(flowReads({ w: 120 }))} path={FLOW} />);
    openLayout();
    const width = screen.getByLabelText('Width') as HTMLInputElement;
    const row = width.parentElement?.parentElement as HTMLElement;
    expect(
      (within(row).getByRole('button', { name: 'Increase' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(within(row).queryByText(/cannot be stepped/)).toBeNull();
  });
});

// The unit affordance (`stepper.unitHint`) is OPT-IN per field, because the
// WIRE decides: a key typed `Length` takes `25mm`, a key typed `number (pt)`
// does not. So each site that offers it is pinned at the site — an optional
// prop whose default is the disabled value can otherwise be dropped in a
// refactor with no type error, no lint and no red test.

describe('BoxSection unit affordance', () => {
  it('invites another unit on a box coordinate', () => {
    const reads = {
      'sections.body': { type: 'flow' },
      'sections.body.items[0]': { type: 'text', text: 'hi', style: {}, box: { x: 30 } },
    };
    draw(<PropertyPanel controller={makeController(reads)} path="sections.body.items[0]" />);
    openLayout();
    expect(unitHintsFor('X').length).toBeGreaterThan(0);
  });
});
