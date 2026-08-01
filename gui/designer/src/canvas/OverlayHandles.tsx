// The resize handles on the selected movable box: one small square per
// resizable direction. `resizableHandle` hides any handle whose keys are
// relative-authored (`%`/`em`), so a handle only appears where a drag can
// legally commit. Pointer-only affordance — the keyboard path is arrow-nudge
// plus the property panel's numerics.

import type { ReadFn } from '@shojiku/designer-core';
import type { BoxRect } from '../engine/types';
import type { DragTask } from './overlayDragModel';
import { HANDLE_CURSORS, HANDLE_PX, handleCenter } from './overlayGeometry';
import { HANDLES, resizableHandle } from './resizeHandles';
import type { UseDrag } from './useDrag';

export interface OverlayHandlesProps {
  /** The selected box's path — the resize target. */
  readonly path: string;
  /** The selected box's border rect, already scaled to overlay px. */
  readonly rect: BoxRect;
  readonly read: ReadFn;
  readonly drag: UseDrag<DragTask>;
}

export function OverlayHandles({ path, rect, read, drag }: OverlayHandlesProps) {
  return (
    <>
      {HANDLES.filter((handle) => resizableHandle(read, path, handle)).map((handle) => {
        const { cx, cy } = handleCenter(handle, rect);
        return (
          <rect
            key={handle}
            className="sj-handle"
            x={cx - HANDLE_PX / 2}
            y={cy - HANDLE_PX / 2}
            width={HANDLE_PX}
            height={HANDLE_PX}
            // Inline paint fallback (no-stylesheet hosts); the
            // stylesheet themes via the class.
            fill="#ffffff"
            stroke="#c2402a"
            strokeWidth={1}
            data-handle={handle}
            style={{ cursor: HANDLE_CURSORS[handle] }}
            onPointerDown={(event) => {
              event.stopPropagation();
              drag.begin(
                {
                  mode: 'resize',
                  path,
                  handle,
                  startX: event.clientX,
                  startY: event.clientY,
                },
                event,
              );
            }}
            onPointerMove={drag.move}
            onPointerUp={drag.up}
            onPointerCancel={drag.cancel}
          />
        );
      })}
    </>
  );
}
