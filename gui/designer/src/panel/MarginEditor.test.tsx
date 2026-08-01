import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { MarginEditor } from './MarginEditor';

function makeController(
  page: unknown,
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
    read: (path: string) => (path === 'page' ? page : undefined),
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
  return render(<I18nProvider locale="en-US">{node}</I18nProvider>);
}

const perSideMap = { margin: { top: 10, right: 10, bottom: 10, left: 10 } };

describe('MarginEditor', () => {
  it('defaults to uniform mode with the 25pt all-sides seed', () => {
    draw(<MarginEditor controller={makeController(undefined)} />);
    expect((screen.getByLabelText('Margin') as HTMLSelectElement).value).toBe('uniform');
    expect((screen.getByLabelText('All sides') as HTMLInputElement).value).toBe('25');
    expect(screen.queryByLabelText('Top')).toBeNull();
  });

  it('switches to per-side through the mode select (one batch)', () => {
    const controller = makeController({ margin: 30 });
    draw(<MarginEditor controller={controller} />);
    fireEvent.change(screen.getByLabelText('Margin'), { target: { value: 'perSide' } });
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'removeKey', keys: ['page', 'margin'] },
      { op: 'setScalar', keys: ['page', 'margin', 'top'], value: 30 },
      { op: 'setScalar', keys: ['page', 'margin', 'right'], value: 30 },
      { op: 'setScalar', keys: ['page', 'margin', 'bottom'], value: 30 },
      { op: 'setScalar', keys: ['page', 'margin', 'left'], value: 30 },
    ]);
  });

  it('renders the four side inputs in per-side mode', () => {
    draw(<MarginEditor controller={makeController(perSideMap)} />);
    expect((screen.getByLabelText('Margin') as HTMLSelectElement).value).toBe('perSide');
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      expect((screen.getByLabelText(side) as HTMLInputElement).value).toBe('10');
    }
  });

  it('switches back to uniform through the mode select', () => {
    const controller = makeController(perSideMap);
    draw(<MarginEditor controller={controller} />);
    fireEvent.change(screen.getByLabelText('Margin'), { target: { value: 'uniform' } });
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', keys: ['page', 'margin'], value: 10 },
    ]);
  });

  it('commits the uniform value on a changed blur', () => {
    const controller = makeController({ margin: 25 });
    draw(<MarginEditor controller={controller} />);
    fireEvent.blur(screen.getByLabelText('All sides'), { target: { value: '40' } });
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', keys: ['page', 'margin'], value: 40 },
    ]);
  });

  it('dispatches nothing on an unchanged uniform blur', () => {
    const controller = makeController({ margin: 25 });
    draw(<MarginEditor controller={controller} />);
    fireEvent.blur(screen.getByLabelText('All sides'), { target: { value: '25' } });
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('dispatches nothing on an invalid uniform value', () => {
    const controller = makeController({ margin: 25 });
    draw(<MarginEditor controller={controller} />);
    fireEvent.blur(screen.getByLabelText('All sides'), { target: { value: '15mm' } });
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('commits a single side on a changed blur (map-backed)', () => {
    const controller = makeController(perSideMap);
    draw(<MarginEditor controller={controller} />);
    fireEvent.blur(screen.getByLabelText('Right'), { target: { value: '5%' } });
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', keys: ['page', 'margin', 'right'], value: '5%' },
    ]);
  });

  it('dispatches nothing on an unchanged per-side blur', () => {
    const controller = makeController(perSideMap);
    draw(<MarginEditor controller={controller} />);
    fireEvent.blur(screen.getByLabelText('Top'), { target: { value: '10' } });
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('dispatches nothing on an invalid per-side value', () => {
    const controller = makeController(perSideMap);
    draw(<MarginEditor controller={controller} />);
    fireEvent.blur(screen.getByLabelText('Left'), { target: { value: 'garbage' } });
    expect(controller.applyAll).not.toHaveBeenCalled();
  });
});
