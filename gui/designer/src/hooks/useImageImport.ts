// Image import: the menu file-pick, the canvas file drop, and the panel's
// replace button share ONE pipeline. A transient notice (downscaled / refused
// reason / over-cap) rides the topbar status region; the raise prompt offers the
// next cap step. The size gate runs BEFORE the op — ops never re-check the cap,
// and undo/redo must stay able to re-parse. What the import DOES to the document
// (the gate + the op) is `imageImportRun.ts`; this hook is the React wiring —
// the file input, the drag/drop handlers, the notice state and the cap raise.

import { type ChangeEvent, type DragEvent, useCallback, useMemo, useRef, useState } from 'react';
import type { DragPoint } from '../canvas/useDrag';
import type { EditorController } from '../editor/useEditor';
import { nextCapStep } from '../image/capacity';
import type { ImageCodec } from '../image/import';
import type { ImageBudgets } from '../image/model';
import { resolveInsertTarget } from '../insert/model';
import type { LastGoodPreview } from '../preview/reducer';
import type { PageHit } from './geometry';
import { dropInsertTarget, type ImageAction, runImageImport } from './imageImportRun';

export interface ImageImportOptions {
  readonly imageCodec: ImageCodec | undefined;
  readonly imageBudgets: ImageBudgets;
  readonly editor: EditorController;
  readonly maxBytes: number;
  readonly setMaxBytesState: (bytes: number) => void;
  readonly onTemplateMaxBytesChange: ((bytes: number) => void) | undefined;
  readonly selectClearing: (path: string) => void;
  /** The live last-good preview (the geometry a default box is clamped to). */
  readonly lastGoodRef: { readonly current: LastGoodPreview | null };
  /** The shared canvas hit-test, owned by the palette drag machine. */
  readonly pageHitAt: (point: DragPoint) => PageHit | null;
}

export interface ImageImport {
  readonly imageNotice: string | null;
  readonly fileInputRef: { readonly current: HTMLInputElement | null };
  /** The template's UTF-8 byte size — the SAME unit `parseTemplate`'s cap
   * checks (the headroom indicator reads it too). */
  readonly textBytes: number;
  readonly onImageInsert: () => void;
  readonly onReplaceImage: (targetPath: string, currentSrcLength: number) => void;
  readonly onFilePicked: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onCanvasDragOver: (event: DragEvent<HTMLDivElement>) => void;
  readonly onCanvasDrop: (event: DragEvent<HTMLDivElement>) => void;
  readonly applyRaisedCap: (next: number) => void;
  /** Whether the template holds an `image` item — the headroom indicator shows
   * only then (an image-free template is far below any cap). A loose substring
   * over the canonical wire spelling; a false positive merely shows the
   * indicator early (harmless). */
  readonly hasImageItem: boolean;
  /** The next cap step above the current limit (null at the ceiling) — drives
   * whether the headroom prompt and the over-cap notice offer a raise. */
  readonly nextCap: number | null;
}

export function useImageImport({
  imageCodec,
  imageBudgets,
  editor,
  maxBytes,
  setMaxBytesState,
  onTemplateMaxBytesChange,
  selectClearing,
  lastGoodRef,
  pageHitAt,
}: ImageImportOptions): ImageImport {
  // Destructured ONCE: the controller object is rebuilt every render, so the
  // memo deps below must be these stable fields, never `editor` itself.
  const { text, read, selection, apply, setMaxBytes: setEditorMaxBytes } = editor;
  const [imageNotice, setImageNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingActionRef = useRef<ImageAction | null>(null);

  // The template's UTF-8 byte size — the SAME unit `parseTemplate`'s cap checks.
  // `text.length` counts UTF-16 units and under-counts CJK text (3 UTF-8 bytes
  // ↔ 1 unit), so using it in the projection gate could admit an insert whose
  // real byte size exceeds the cap — and the next undo/redo re-parse would
  // throw. Memoized: an 8 MiB encode per keystroke is not free.
  const textBytes = useMemo(() => new TextEncoder().encode(text).length, [text]);

  // The import itself (size gate, then the op) is pure over this context; only
  // the notice state and the codec live here.
  const runImport = useCallback(
    (file: File, action: ImageAction, codec: ImageCodec): Promise<void> =>
      runImageImport(file, action, codec, {
        imageBudgets,
        textBytes,
        maxBytes,
        apply,
        selectClearing,
        lastGoodRef,
        setNotice: setImageNotice,
      }),
    [imageBudgets, textBytes, maxBytes, apply, selectClearing, lastGoodRef],
  );

  // The insert-menu image entry: remember where the insert lands, then open the
  // native file picker (the async import resumes in the input's change handler).
  const onImageInsert = useCallback(() => {
    pendingActionRef.current = { kind: 'insert', target: resolveInsertTarget(read, selection) };
    fileInputRef.current?.click();
  }, [read, selection]);
  // The panel's "replace image" button: swap the src of the image at `path`.
  // The panel passes the current src length (it already read the item) so the
  // size projection nets it out without a second read here.
  const onReplaceImage = useCallback((targetPath: string, currentSrcLength: number) => {
    pendingActionRef.current = { kind: 'replace', path: targetPath, currentSrcLength };
    fileInputRef.current?.click();
  }, []);
  const onFilePicked = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      const action = pendingActionRef.current;
      // Reset the input so re-picking the same file fires `change` again.
      event.target.value = '';
      if (imageCodec !== undefined && file !== undefined && action !== null) {
        void runImport(file, action, imageCodec);
      }
    },
    [runImport, imageCodec],
  );

  // Canvas file drop: an image file dropped on a page inserts at the planned
  // flow slot (reusing the palette hit-test); a drop off every page appends to
  // the body. A non-image drag is ignored. Only the FIRST file is imported.
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

  // Apply a raised template-size cap (`next`, already resolved to a step): tell
  // the editor (so re-parses accept the larger document), update local state,
  // notify the host to persist, and clear any over-cap notice.
  const applyRaisedCap = useCallback(
    (next: number) => {
      setEditorMaxBytes(next);
      setMaxBytesState(next);
      onTemplateMaxBytesChange?.(next);
      setImageNotice(null);
    },
    [setEditorMaxBytes, setMaxBytesState, onTemplateMaxBytesChange],
  );

  const hasImageItem = useMemo(() => text.includes('type: image'), [text]);

  return {
    imageNotice,
    fileInputRef,
    textBytes,
    onImageInsert,
    onReplaceImage,
    onFilePicked,
    onCanvasDragOver,
    onCanvasDrop,
    applyRaisedCap,
    hasImageItem,
    nextCap: nextCapStep(maxBytes),
  };
}
