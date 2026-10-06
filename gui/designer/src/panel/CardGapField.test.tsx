import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { CardGapField, cardGapStepOp } from './CardGapField';

const PATH = 'sections.body.items[0]';

function makeController(node: unknown): EditorController {
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: (path: string) => (path === PATH ? node : undefined),
    undo: vi.fn(),
    redo: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setMaxBytes: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceDocument: vi.fn(),
  };
}

function drawField(node: unknown) {
  const controller = makeController(node);
  render(
    <I18nProvider locale="en">
      <CardGapField controller={controller} path={PATH} />
    </I18nProvider>,
  );
  return controller;
}

const gap = () => screen.getByLabelText('Space between cards') as HTMLInputElement;

describe('CardGapField', () => {
  it('shows the authored gap and writes a typed one to the repeat_flow itself', () => {
    const controller = drawField({ type: 'repeat_flow', gap: 8 });
    expect(gap().value).toBe('8');
    fireEvent.change(gap(), { target: { value: '12' } });
    fireEvent.blur(gap());
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['gap'],
      value: 12,
    });
  });

  it('takes a % of the region, clamps a negative to 0, refuses garbage, clears when emptied', () => {
    const controller = drawField({ type: 'repeat_flow', gap: 8 });
    const commit = (raw: string) => {
      fireEvent.change(gap(), { target: { value: raw } });
      fireEvent.blur(gap());
    };
    commit('5%');
    expect(controller.apply).toHaveBeenLastCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['gap'],
      value: '5%',
    });
    commit('-3');
    expect(controller.apply).toHaveBeenLastCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['gap'],
      value: 0,
    });
    const calls = (controller.apply as ReturnType<typeof vi.fn>).mock.calls.length;
    commit('wide');
    expect(controller.apply).toHaveBeenCalledTimes(calls);
    expect(gap().value).toBe('8');
    commit('');
    expect(controller.apply).toHaveBeenLastCalledWith({
      op: 'removeKey',
      path: PATH,
      keys: ['gap'],
    });
  });

  it('steps an unset gap up from 0', () => {
    const controller = drawField({ type: 'repeat_flow' });
    expect(gap().placeholder).toBe('0');
    fireEvent.click(screen.getByLabelText('Increase Space between cards'));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['gap'],
      value: 1,
    });
  });

  it('does not step a relative gap, and a hostile read shows nothing', () => {
    expect(cardGapStepOp(PATH, '5%', 1)).toBeNull();
    expect(cardGapStepOp(PATH, '3', -1)).toMatchObject({ value: 2 });
    drawField(undefined);
    expect(gap().value).toBe('');
  });
});
