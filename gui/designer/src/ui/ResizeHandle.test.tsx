import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResizeHandle } from './ResizeHandle';

/** Render a handle over a 240px pane clamped to [180, 480], returning the
 * separator element plus the two report spies. */
function setup(width = 240) {
  const onResize = vi.fn();
  const onCommit = vi.fn();
  render(
    <ResizeHandle
      width={width}
      min={180}
      max={480}
      onResize={onResize}
      onCommit={onCommit}
      label="Resize sidebar"
    />,
  );
  return { handle: screen.getByRole('separator'), onResize, onCommit };
}

/** A native event carrying fields the MouseEvent constructor would coerce
 * (non-finite coordinates) — the shape a hostile script actually dispatches. */
function forge(type: string, fields: Record<string, unknown>): Event {
  const event = new Event(type, { bubbles: true });
  for (const [key, value] of Object.entries(fields)) {
    Object.defineProperty(event, key, { value });
  }
  return event;
}

describe('ResizeHandle', () => {
  it('exposes the splitter role with the current width and bounds', () => {
    const { handle } = setup(240);
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('aria-label')).toBe('Resize sidebar');
    expect(handle.getAttribute('aria-valuenow')).toBe('240');
    expect(handle.getAttribute('aria-valuemin')).toBe('180');
    expect(handle.getAttribute('aria-valuemax')).toBe('480');
    expect(handle.getAttribute('tabindex')).toBe('0');
  });

  it('resizes live while dragging and commits the settled width on release', () => {
    const { handle, onResize, onCommit } = setup(240);
    fireEvent.pointerDown(handle, { pointerId: 1, isPrimary: true, clientX: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 140 });
    expect(onResize).toHaveBeenLastCalledWith(280);
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 140 });
    expect(onCommit).toHaveBeenCalledWith(280);
  });

  it('clamps a drag to the min and max bounds', () => {
    const { handle, onResize } = setup(240);
    fireEvent.pointerDown(handle, { pointerId: 1, isPrimary: true, clientX: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 1000 });
    expect(onResize).toHaveBeenLastCalledWith(480);
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: -1000 });
    expect(onResize).toHaveBeenLastCalledWith(180);
  });

  it('captures the pointer when the element supports it', () => {
    const { handle } = setup();
    const capture = vi.fn();
    (handle as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = capture;
    fireEvent.pointerDown(handle, { pointerId: 7, isPrimary: true, clientX: 50 });
    expect(capture).toHaveBeenCalledWith(7);
  });

  it('ignores a non-primary press so no drag arms', () => {
    const { handle, onResize } = setup();
    fireEvent.pointerDown(handle, { pointerId: 1, isPrimary: false, clientX: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 140 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('ignores a non-finite press', () => {
    const { handle, onResize } = setup();
    handle.dispatchEvent(
      forge('pointerdown', { pointerId: 1, isPrimary: true, clientX: Number.NaN }),
    );
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 140 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('ignores a move with no active drag', () => {
    const { handle, onResize } = setup();
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 140 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('ignores a non-finite move mid-drag', () => {
    const { handle, onResize } = setup();
    fireEvent.pointerDown(handle, { pointerId: 1, isPrimary: true, clientX: 100 });
    handle.dispatchEvent(forge('pointermove', { pointerId: 1, clientX: Number.NaN }));
    expect(onResize).not.toHaveBeenCalled();
  });

  it('ignores a release with no active drag', () => {
    const { handle, onCommit } = setup();
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 140 });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('nudges the width with the arrow keys and commits each step', () => {
    const { handle, onResize, onCommit } = setup(240);
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onResize).toHaveBeenLastCalledWith(256);
    expect(onCommit).toHaveBeenLastCalledWith(256);
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenLastCalledWith(224);
    expect(onCommit).toHaveBeenLastCalledWith(224);
  });

  it('ignores an unrelated key', () => {
    const { handle, onResize, onCommit } = setup();
    fireEvent.keyDown(handle, { key: 'a' });
    expect(onResize).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('renders a decorative grip that adds nothing for a screen reader', () => {
    const { handle } = setup();
    // A discoverability affordance: present in the DOM, aria-hidden so the
    // separator keeps sole ownership of the accessible name + valuenow.
    const grip = handle.querySelector('[aria-hidden="true"]');
    expect(grip).not.toBeNull();
  });
});
