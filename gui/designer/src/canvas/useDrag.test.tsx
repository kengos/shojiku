import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type DragPoint, useDrag } from './useDrag';

/** A minimal harness: one draggable target wired to the hook, reporting the
 * session phase and whether each click was suppressed. */
function Probe({
  onDrop,
  onClick,
}: {
  onDrop: (payload: string, point: DragPoint) => void;
  onClick?: (suppressed: boolean) => void;
}) {
  const drag = useDrag<string>(onDrop);
  const phase = drag.session === null ? 'idle' : drag.session.started ? 'drag' : 'armed';
  return (
    <div>
      <button
        type="button"
        data-testid="target"
        onPointerDown={(event) => drag.begin('payload', event)}
        onPointerMove={drag.move}
        onPointerUp={drag.up}
        onPointerCancel={drag.cancel}
        onClick={() => onClick?.(drag.consumeClick())}
      />
      <output>{phase}</output>
    </div>
  );
}

const down = (el: Element, init: Record<string, unknown> = {}) =>
  fireEvent.pointerDown(el, { pointerId: 1, isPrimary: true, clientX: 0, clientY: 0, ...init });

describe('useDrag', () => {
  it('stays a click below the travel threshold', () => {
    const onDrop = vi.fn();
    const onClick = vi.fn();
    render(<Probe onDrop={onDrop} onClick={onClick} />);
    const target = screen.getByTestId('target');
    down(target);
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 1, clientY: 2 });
    expect(screen.getByRole('status').textContent).toBe('armed');
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 1, clientY: 2 });
    fireEvent.click(target);
    expect(onDrop).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledWith(false);
    expect(screen.getByRole('status').textContent).toBe('idle');
  });

  it('starts the drag at the threshold and commits the drop point', () => {
    const onDrop = vi.fn();
    const onClick = vi.fn();
    render(<Probe onDrop={onDrop} onClick={onClick} />);
    const target = screen.getByTestId('target');
    down(target);
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 0, clientY: 10 });
    expect(screen.getByRole('status').textContent).toBe('drag');
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 3, clientY: 40 });
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith('payload', { x: 3, y: 40, alt: false, shift: false });
    // The trailing click of a completed drag is suppressed exactly once.
    fireEvent.click(target);
    expect(onClick).toHaveBeenCalledWith(true);
    fireEvent.click(target);
    expect(onClick).toHaveBeenLastCalledWith(false);
  });

  it('cancels on Escape, stopping the propagation other listeners would see', () => {
    const onDrop = vi.fn();
    const onClick = vi.fn();
    const bystander = vi.fn();
    window.addEventListener('keydown', bystander);
    try {
      render(<Probe onDrop={onDrop} onClick={onClick} />);
      const target = screen.getByTestId('target');
      down(target);
      fireEvent.pointerMove(target, { pointerId: 1, clientX: 0, clientY: 10 });
      fireEvent.keyDown(target, { key: 'Escape' });
      expect(screen.getByRole('status').textContent).toBe('idle');
      expect(bystander).not.toHaveBeenCalled();
      // The release after the cancel commits nothing; its click is suppressed.
      fireEvent.pointerUp(target, { pointerId: 1, clientX: 0, clientY: 10 });
      fireEvent.click(target);
      expect(onDrop).not.toHaveBeenCalled();
      expect(onClick).toHaveBeenCalledWith(true);
    } finally {
      window.removeEventListener('keydown', bystander);
    }
  });

  it('leaves other keys and pre-threshold Escapes alone', () => {
    const onDrop = vi.fn();
    render(<Probe onDrop={onDrop} />);
    const target = screen.getByTestId('target');
    down(target);
    // Below the threshold there is no drag to cancel — Escape is not captured.
    fireEvent.keyDown(target, { key: 'Escape' });
    expect(screen.getByRole('status').textContent).toBe('armed');
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 0, clientY: 10 });
    fireEvent.keyDown(target, { key: 'a' });
    expect(screen.getByRole('status').textContent).toBe('drag');
  });

  it('clears on pointercancel without committing', () => {
    const onDrop = vi.fn();
    render(<Probe onDrop={onDrop} />);
    const target = screen.getByTestId('target');
    down(target);
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 0, clientY: 10 });
    fireEvent.pointerCancel(target, { pointerId: 1 });
    expect(screen.getByRole('status').textContent).toBe('idle');
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 0, clientY: 10 });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('ignores non-primary pointers and mismatched pointer ids', () => {
    const onDrop = vi.fn();
    render(<Probe onDrop={onDrop} />);
    const target = screen.getByTestId('target');
    fireEvent.pointerDown(target, { pointerId: 1, isPrimary: false, clientX: 0, clientY: 0 });
    expect(screen.getByRole('status').textContent).toBe('idle');
    down(target);
    // A second pointer's move/up must not advance or end the session.
    fireEvent.pointerMove(target, { pointerId: 2, clientX: 0, clientY: 50 });
    expect(screen.getByRole('status').textContent).toBe('armed');
    fireEvent.pointerUp(target, { pointerId: 2, clientX: 0, clientY: 50 });
    expect(screen.getByRole('status').textContent).toBe('armed');
    // Idle moves/ups (no session at all) are equally inert.
    fireEvent.pointerCancel(target, { pointerId: 1 });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 0, clientY: 50 });
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 0, clientY: 50 });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('captures the pointer when the element supports it', () => {
    const onDrop = vi.fn();
    render(<Probe onDrop={onDrop} />);
    const target = screen.getByTestId('target');
    const capture = vi.fn();
    (target as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = capture;
    down(target);
    expect(capture).toHaveBeenCalledWith(1);
  });

  it('rejects hostile non-finite press/move coordinates', () => {
    const onDrop = vi.fn();
    render(<Probe onDrop={onDrop} />);
    const target = screen.getByTestId('target');
    const forge = (type: string, fields: Record<string, unknown>) => {
      const event = new Event(type, { bubbles: true });
      for (const [key, value] of Object.entries(fields)) {
        Object.defineProperty(event, key, { value });
      }
      return event;
    };
    // A press with a non-finite coordinate never arms a session.
    target.dispatchEvent(
      forge('pointerdown', { pointerId: 1, isPrimary: true, clientX: Number.NaN, clientY: 0 }),
    );
    expect(screen.getByRole('status').textContent).toBe('idle');
    // A hostile move mid-session is ignored; the session stays where it was.
    down(target);
    target.dispatchEvent(forge('pointermove', { pointerId: 1, clientX: Number.NaN, clientY: 100 }));
    expect(screen.getByRole('status').textContent).toBe('armed');
    // A hostile release point falls back to the last sane session point.
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 0, clientY: 10 });
    target.dispatchEvent(
      forge('pointerup', { pointerId: 1, clientX: Number.NaN, clientY: Number.NaN }),
    );
    expect(onDrop).toHaveBeenCalledWith('payload', { x: 0, y: 10, alt: false, shift: false });
  });
});
