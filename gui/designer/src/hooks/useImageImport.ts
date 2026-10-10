// Image import: the menu file-pick, the canvas file drop, a clipboard paste, the
// panel's replace button and its switch of a bound image to fixed share ONE
// pipeline. A transient notice (downscaled / refused reason / over-cap) rides
// the topbar status region; the raise prompt offers the next cap step. The size
// gate runs BEFORE the op — ops never re-check the cap, and undo/redo must stay
// able to re-parse. What the import DOES to the document (the gate + the op) is
// `imageImportRun.ts`; this hook is the React wiring — the file input, the
// panel's actions, the notice state and the cap raise. The drop and paste routes
// are `useCanvasImageDrop` and `usePasteImage`, called from here.

import { type ChangeEvent, type DragEvent, useCallback, useMemo, useRef, useState } from 'react';
import type { DragPoint } from '../canvas/useDrag';
import type { EditorController } from '../editor/useEditor';
import { nextCapStep } from '../image/capacity';
import type { ImageCodec } from '../image/import';
import type { ImageBudgets } from '../image/model';
import { resolveInsertTarget } from '../insert/model';
import type { LastGoodPreview } from '../preview/reducer';
import type { PageHit } from './geometry';
import { type ImageAction, restoreImageSource, runImageImport } from './imageImportRun';
import { useCanvasImageDrop } from './useCanvasImageDrop';
import { usePasteImage } from './usePasteImage';

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
  /** Make the bound image at `targetPath` fixed: write `remembered` through the
   * size gate, or — with nothing remembered — pick a file (a no-op without a
   * codec, which the panel knows by `onReplaceImage` being withheld). */
  readonly onFixImageSource: (targetPath: string, remembered: string | null) => void;
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
  const { text, read, selection, apply, applyAll, setMaxBytes: setEditorMaxBytes } = editor;
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
        read,
        apply,
        applyAll,
        selectClearing,
        lastGoodRef,
        setNotice: setImageNotice,
      }),
    [imageBudgets, textBytes, maxBytes, read, apply, applyAll, selectClearing, lastGoodRef],
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
  // The panel's switch of a bound image to fixed. A remembered `src` is written
  // straight away (after the size gate); otherwise the file picker opens and the
  // import drops the binding in the same batch as it writes the new `src`.
  const onFixImageSource = useCallback(
    (targetPath: string, remembered: string | null) => {
      if (remembered !== null) {
        restoreImageSource(targetPath, remembered, {
          textBytes,
          maxBytes,
          applyAll,
          setNotice: setImageNotice,
        });
        return;
      }
      if (imageCodec === undefined) {
        return;
      }
      pendingActionRef.current = {
        kind: 'replace',
        path: targetPath,
        currentSrcLength: 0,
        dropData: true,
      };
      fileInputRef.current?.click();
    },
    [textBytes, maxBytes, applyAll, imageCodec],
  );
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

  // The canvas file drop and the clipboard paste: the same pipeline, wired by
  // their own hooks (each route's guards live there).
  const { onCanvasDragOver, onCanvasDrop } = useCanvasImageDrop({
    imageCodec,
    pageHitAt,
    read,
    selection,
    runImport,
  });
  const insertTarget = useCallback(() => resolveInsertTarget(read, selection), [read, selection]);
  usePasteImage({ imageCodec, insertTarget, runImport });

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
    onFixImageSource,
    onFilePicked,
    onCanvasDragOver,
    onCanvasDrop,
    applyRaisedCap,
    hasImageItem,
    nextCap: nextCapStep(maxBytes),
  };
}
