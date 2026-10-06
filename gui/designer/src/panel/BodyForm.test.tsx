// The body's own form, reached the way the layer tree reaches it: selecting
// `sections.body` in the property panel.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import type { PlacedBox } from '../engine/types';
import { I18nProvider } from '../i18n/context';
import { PropertyPanel } from './PropertyPanel';
import type { PlacementGeometry } from './placementGeometry';

const BODY = 'sections.body';
const item = (i: number) => `${BODY}.items[${i}]`;

function makeController(body: Record<string, unknown>): EditorController {
  const map: Record<string, unknown> = { [BODY]: body };
  (Array.isArray(body.items) ? body.items : []).forEach((child, i) => {
    map[item(i)] = child;
  });
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: (path: string) => (Object.hasOwn(map, path) ? map[path] : undefined),
    undo: vi.fn(),
    redo: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setMaxBytes: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceDocument: vi.fn(),
  };
}

function placed(path: string, x: number, y: number): PlacedBox {
  const rect = { x, y, w: 50, h: 10 };
  return { path, border: rect, content: rect };
}

function geometry(pages: PlacedBox[][], fresh = true): PlacementGeometry {
  return { boxes: { pages }, margin: [20, 0, 0, 30], fresh };
}

function draw(controller: EditorController, geo: PlacementGeometry | null = null) {
  render(
    <I18nProvider locale="en">
      <PropertyPanel controller={controller} path={BODY} geometry={geo} />
    </I18nProvider>,
  );
}

const TEXT = { type: 'text', text: 'a' };

describe('the body form', () => {
  it('replaces the item panel: no name field (a body takes no id)', () => {
    draw(makeController({ type: 'flow', items: [TEXT] }));
    expect(screen.getByText('Body')).toBeTruthy();
    expect(screen.queryByText('Name (ID)')).toBeNull();
    expect((screen.getByLabelText('Flow') as HTMLInputElement).checked).toBe(true);
    expect(
      screen.getByText('Items stack from the top and continue onto the next page.'),
    ).toBeTruthy();
  });

  it('switches a flowing body to placed items in one batch when nothing is lost', () => {
    const controller = makeController({ type: 'flow', items: [TEXT] });
    draw(controller, geometry([[placed(item(0), 30, 20)]]));
    fireEvent.click(screen.getByLabelText('Fixed position'));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: BODY, keys: ['type'], value: 'absolute' },
      { op: 'setScalar', path: item(0), keys: ['box', 'x'], value: 0 },
      { op: 'setScalar', path: item(0), keys: ['box', 'y'], value: 0 },
    ]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks first, with the counts, when items would be lost — confirm applies, cancel does not', () => {
    const controller = makeController({
      type: 'flow',
      items: [TEXT, TEXT, { type: 'page_break' }, TEXT, { type: 'table', columns: [] }],
    });
    draw(
      controller,
      geometry([
        [placed(item(0), 30, 20), placed(item(4), 30, 40)],
        [placed(item(1), 30, 20), placed(item(4), 30, 20)],
      ]),
    );
    fireEvent.click(screen.getByLabelText('Fixed position'));
    expect(controller.applyAll).not.toHaveBeenCalled();
    // In reading order: deleted, cut off, unplaced, skipped.
    expect(screen.getAllByRole('paragraph').map((p) => p.textContent)).toEqual(
      expect.arrayContaining([
        'Items that start on page 2 or later will be deleted (Fixed position uses page 1 only): 1.',
        'Items that run past page 1 will be cut off at the end of page 1: 1.',
        "Items with no known position (for example, hidden by a condition in the sample data). They'll be placed at the top of page 1: 1.",
        'Repeats and page breaks that will be skipped: 1.',
      ]),
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(controller.applyAll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Fixed position'));
    fireEvent.click(screen.getByText('Switch'));
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
  });

  it('asks first when a table loses its page-break settings', () => {
    const table = { type: 'table', autoPageBreak: true, columns: [] };
    const controller = makeController({ type: 'flow', items: [table] });
    draw(controller, geometry([[placed(item(0), 30, 20)]]));
    fireEvent.click(screen.getByLabelText('Fixed position'));
    expect(
      screen.getByText('Tables that will lose their Flow-only page-break settings: 1.'),
    ).toBeTruthy();
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('names only the losses that happen', () => {
    const controller = makeController({ type: 'flow', items: [TEXT, { type: 'page_break' }] });
    draw(controller, geometry([[placed(item(0), 30, 20)]]));
    fireEvent.click(screen.getByLabelText('Fixed position'));
    expect(screen.getByText('Repeats and page breaks that will be skipped: 1.')).toBeTruthy();
    expect(screen.queryByText(/will be deleted/)).toBeNull();
    expect(screen.getByText('You can undo this.')).toBeTruthy();
  });

  it('Escape dismisses the confirm without switching', () => {
    const controller = makeController({ type: 'flow', items: [TEXT, { type: 'page_break' }] });
    draw(controller, geometry([[placed(item(0), 30, 20)]]));
    fireEvent.click(screen.getByLabelText('Fixed position'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('withholds the switch until the preview has caught up, saying so', () => {
    draw(makeController({ type: 'flow', items: [TEXT] }), geometry([[]], false));
    expect((screen.getByLabelText(/^Fixed position/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Available once the preview is up to date.')).toBeTruthy();
  });

  it('switches placed items back to a flowing body', () => {
    const controller = makeController({ type: 'absolute', items: [{ ...TEXT, box: { y: 5 } }] });
    draw(controller);
    expect(
      screen.getByText('Each item stays where you put it on page 1. Nothing moves to later pages.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Flow'));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: BODY, keys: ['type'], value: 'flow' },
      { op: 'putValue', path: BODY, keys: ['box'], value: { x: 0, y: 5, w: '100%', h: 786.89 } },
      { op: 'removeKey', path: item(0), keys: ['box', 'y'] },
    ]);
  });

  it('edits a flowing body gap and region at the body path; a placed body has neither', () => {
    const controller = makeController({ type: 'flow', gap: 6, items: [TEXT] });
    draw(controller);
    const gap = screen.getByLabelText('Space between items') as HTMLInputElement;
    expect(gap.value).toBe('6');
    fireEvent.change(gap, { target: { value: '10%' } });
    fireEvent.blur(gap);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: BODY,
      keys: ['gap'],
      value: '10%',
    });
    fireEvent.click(screen.getByLabelText('Increase Space between items'));
    expect(controller.apply).toHaveBeenLastCalledWith({
      op: 'setScalar',
      path: BODY,
      keys: ['gap'],
      value: 7,
    });
    const y = screen.getByLabelText('Y') as HTMLInputElement;
    fireEvent.change(y, { target: { value: '40' } });
    fireEvent.blur(y);
    // The region is whole on the wire: one field writes all four.
    expect(controller.applyAll).toHaveBeenLastCalledWith([
      { op: 'putValue', path: BODY, keys: ['box'], value: { x: 0, y: 40, w: '100%', h: '100%' } },
    ]);
    expect((screen.getByLabelText('Width') as HTMLInputElement).placeholder).toBe('100%');
    // Back at the whole-area values on an empty region: nothing to write.
    const calls = vi.mocked(controller.applyAll).mock.calls.length;
    // The committed field re-mounts (it reseeds from the document).
    const again = screen.getByLabelText('Y') as HTMLInputElement;
    fireEvent.change(again, { target: { value: '0' } });
    fireEvent.blur(again);
    expect(controller.applyAll).toHaveBeenCalledTimes(calls);
    expect(
      screen.getByText(
        'Leave all empty to use the whole area inside the margins. X and Y are measured from the top-left corner inside the margins.',
      ),
    ).toBeTruthy();
  });

  it('shows the authored region, and nothing of it on a placed body', () => {
    const { unmount } = render(
      <I18nProvider locale="en">
        <PropertyPanel
          controller={makeController({ type: 'flow', box: { x: 12 }, items: [] })}
          path={BODY}
        />
      </I18nProvider>,
    );
    expect((screen.getByLabelText('X') as HTMLInputElement).value).toBe('12');
    unmount();
    draw(makeController({ type: 'absolute', items: [] }));
    expect(screen.queryByLabelText('Space between items')).toBeNull();
    expect(screen.queryByLabelText('X')).toBeNull();
  });

  it('names the op cap as the reason either way, instead of waiting for the preview', () => {
    const items = Array.from({ length: 300 }, () => ({ ...TEXT, box: { y: 1 } }));
    const controller = makeController({ type: 'absolute', items });
    const { unmount } = render(
      <I18nProvider locale="en">
        <PropertyPanel controller={controller} path={BODY} />
      </I18nProvider>,
    );
    expect((screen.getByLabelText(/^Flow/) as HTMLInputElement).disabled).toBe(true);
    expect(
      screen.getByText(
        'This document has too many items to switch modes. Remove some items to switch.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/^Flow/));
    expect(controller.applyAll).not.toHaveBeenCalled();
    unmount();
    const flowing = Array.from({ length: 300 }, () => TEXT);
    draw(
      makeController({ type: 'flow', items: flowing }),
      geometry([flowing.map((_, i) => placed(item(i), 30, 20))]),
    );
    expect((screen.getByLabelText(/^Fixed position/) as HTMLInputElement).disabled).toBe(true);
    expect(
      screen.getByText(
        'This document has too many items to switch modes. Remove some items to switch.',
      ),
    ).toBeTruthy();
  });

  it('offers no switch for a body of an unknown kind', () => {
    draw(makeController({ type: 'columns', items: [] }));
    expect(screen.queryByLabelText('Flow')).toBeNull();
  });
});
