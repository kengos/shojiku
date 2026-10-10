// An image FILE dropped on the canvas: imported through the SAME pipeline as
// the menu file-pick, the clipboard paste and the panel's buttons
// (`useImageImport` owns that pipeline and calls this hook with it). Split out
// like `usePasteImage`, one route per hook, each with its own guards.

import type { ReadFn } from '@shojiku/designer-core';
import { type DragEvent, useCallback } from 'react';
import type { DragPoint } from '../canvas/useDrag';
import type { ImageCodec } from '../image/import';
import type { PageHit } from './geometry';
import { dropInsertTarget, type ImageAction } from './imageImportRun';

export interface CanvasImageDropOptions {
  /** Absent = the host injected no codec; the drop route stays inert. */
  readonly imageCodec: ImageCodec | undefined;
  /** The shared canvas hit-test, owned by the palette drag machine. */
  readonly pageHitAt: (point: DragPoint) => PageHit | null;
  readonly read: ReadFn;
  readonly selection: string | null;
  /** The shared import run (size gate, then the op). */
  readonly runImport: (file: File, action: ImageAction, codec: ImageCodec) => Promise<void>;
}

export interface CanvasImageDrop {
  readonly onCanvasDragOver: (event: DragEvent<HTMLDivElement>) => void;
  readonly onCanvasDrop: (event: DragEvent<HTMLDivElement>) => void;
}

/** An image file dropped on a page inserts at the planned flow slot (reusing
 * the palette hit-test); a drop off every page appends to the body. A
 * non-image drag is ignored. Only the FIRST file is imported. */
export function useCanvasImageDrop({
  imageCodec,
  pageHitAt,
  read,
  selection,
  runImport,
}: CanvasImageDropOptions): CanvasImageDrop {
  const onCanvasDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (imageCodec !== undefined && Array.from(event.dataTransfer.types).includes('Files')) {
        event.preventDefault();
      }
    },
    [imageCodec],
  );
  const onCanvasDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (imageCodec === undefined) {
        return;
      }
      const file = event.dataTransfer.files[0];
      if (file === undefined) {
        return;
      }
      event.preventDefault();
      const hit = pageHitAt({ x: event.clientX, y: event.clientY });
      const target = dropInsertTarget(read, selection, hit);
      void runImport(file, { kind: 'insert', target }, imageCodec);
    },
    [imageCodec, pageHitAt, read, selection, runImport],
  );
  return { onCanvasDragOver, onCanvasDrop };
}
