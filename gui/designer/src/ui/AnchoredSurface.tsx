// A surface pinned to a pointer point — the shell the right-click menu and the
// border popover share. It owns exactly two things: POSITION (the click point,
// clamped into the viewport once the surface has measured itself) and DISMISSAL
// (Escape in the CAPTURE phase with propagation stopped, so the Designer's
// window-level deselect never also fires; plus a pointer press outside it). It
// knows nothing about what it contains, and the caller decides whether it exists
// at all — there is no closed state here.
//
// The role is a LITERAL `menu` rather than a prop: both surfaces anchored this
// way are menus (the format toolbar's popovers use the same role), and the a11y
// lint reads the attribute statically — a role arriving as an expression makes
// the element a static one with handlers on it.
//
// The element is held in STATE rather than a ref: the position needs a render
// once it is measured, and a state-held node is null on unmount, which a ref
// read only after mount never is.

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useLayoutEffect,
  useState,
} from 'react';
import { type AnchorPoint, clampToViewport } from './anchorPosition';

export interface AnchoredSurfaceProps {
  /** The pointer position in viewport (client) px. */
  readonly at: AnchorPoint;
  readonly onClose: () => void;
  readonly className: string;
  readonly ariaOrientation?: 'vertical';
  readonly onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  readonly children: ReactNode;
}

export function AnchoredSurface({
  at,
  onClose,
  className,
  ariaOrientation,
  onKeyDown,
  children,
}: AnchoredSurfaceProps) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<AnchorPoint | null>(null);
  // The effect below depends on the COORDINATES, never on the `at` object: it
  // sets a freshly built position object, so a caller passing an inline
  // `at={{ x, y }}` would otherwise re-arm the effect on every render it caused.
  const { x, y } = at;

  // Measure before paint: the first render places the surface at the raw point,
  // this pulls it inside the viewport in the same frame.
  useLayoutEffect(() => {
    if (node === null) {
      return;
    }
    const rect = node.getBoundingClientRect();
    setPosition(
      clampToViewport(
        { x, y },
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [x, y, node]);

  useLayoutEffect(() => {
    if (node === null) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!node.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [node, onClose]);

  const placed = position ?? at;
  return (
    <div
      ref={setNode}
      role="menu"
      aria-orientation={ariaOrientation}
      className={`fixed z-50 ${className}`}
      style={{ left: placed.x, top: placed.y }}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
