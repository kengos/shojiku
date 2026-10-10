// What an image import DOES to the document, apart from the React wiring that
// triggers it: where the image lands, the size gate that runs BEFORE the op, and
// the op itself (a fresh `insertItem`, a `src` replacement, or a bound image
// made fixed — its `data` dropped in the same batch). A remembered `src` the
// panel restores passes the same gate (`restoreImageSource`). Pure over an
// explicit context, so the refusal branches are exercisable without a DOM.
//
// The gate runs before the op because ops never re-check the template-size cap
// and undo/redo must stay able to re-parse; a replace nets out the OLD src
// length (ASCII base64, so char count = byte count) so swapping one image for a
// similar one is never falsely refused.

import type { BatchResult, Op, OpResult, ReadFn } from '@shojiku/designer-core';
import { nextCapStep, projectImport } from '../image/capacity';
import { type ImageCodec, importImageFile } from '../image/import';
import { defaultBox, type ImageBudgets, type ImportRefusal } from '../image/model';
import { BODY_ITEMS_PATH, type InsertTarget, resolveInsertTarget } from '../insert/model';
import { placeForTarget } from '../insert/targetPlacement';
import { planInsertDrop } from '../palette/drag';
import { imageToFixedOps } from '../panel/imageSourceOps';
import type { LastGoodPreview } from '../preview/reducer';
import { contentWidthPt, type PageHit } from './geometry';

/** Where the imported image lands: a fresh insert, or a `src` replacement of an
 * existing image (carrying the old src length so the size projection nets it
 * out rather than double-counting). `dropData` makes a BOUND image fixed: its
 * `data` goes in the same batch, so the item never carries both sources. */
export type ImageAction =
  | { readonly kind: 'insert'; readonly target: InsertTarget }
  | {
      readonly kind: 'replace';
      readonly path: string;
      readonly currentSrcLength: number;
      readonly dropData?: boolean;
    };

/** Everything the import reads or writes besides the file itself. `textBytes` is
 * the RENDER-time template size (the same value the gate has always used), not
 * an accessor — the projection is against the document the user is looking at. */
export interface ImageImportContext {
  readonly imageBudgets: ImageBudgets;
  readonly textBytes: number;
  readonly maxBytes: number;
  readonly read: ReadFn;
  readonly apply: (op: Op) => OpResult;
  readonly applyAll: (ops: readonly Op[]) => BatchResult;
  readonly selectClearing: (path: string) => void;
  readonly lastGoodRef: { readonly current: LastGoodPreview | null };
  readonly setNotice: (notice: string | null) => void;
}

/** Import a file and apply it (insert a new image, or replace an existing src),
 * reporting every refusal as a notice key. */
export async function runImageImport(
  file: File,
  action: ImageAction,
  codec: ImageCodec,
  ctx: ImageImportContext,
): Promise<void> {
  const { textBytes, maxBytes } = ctx;
  ctx.setNotice(null);
  const outcome = await importImageFile(file, codec, ctx.imageBudgets);
  if (!outcome.ok) {
    ctx.setNotice(`image.notice.${outcome.reason satisfies ImportRefusal}`);
    return;
  }
  const baseBytes = action.kind === 'replace' ? textBytes - action.currentSrcLength : textBytes;
  if (!projectImport(baseBytes, outcome.src.length, maxBytes).fits) {
    ctx.setNotice(capNotice(maxBytes));
    return;
  }
  const result =
    action.kind === 'insert'
      ? ctx.apply({
          op: 'insertItem',
          path: action.target.path,
          index: action.target.index,
          // Band-placed (bottom-aligned by its own height in a footer) when the
          // target is a header/footer directly.
          value: placeForTarget(ctx.read, ctx.lastGoodRef.current, action.target.path, {
            type: 'image',
            box: defaultBox(outcome.intrinsic, contentWidthPt(ctx.lastGoodRef.current)),
            src: outcome.src,
          }),
        })
      : ctx.applyAll(
          action.dropData === true
            ? imageToFixedOps(action.path, outcome.src)
            : [{ op: 'setScalar', path: action.path, keys: ['src'], value: outcome.src }],
        );
  if (result.ok) {
    ctx.selectClearing(
      action.kind === 'insert' ? `${action.target.path}[${action.target.index}]` : action.path,
    );
    if (outcome.downscaled) {
      ctx.setNotice('image.notice.downscaled');
    }
  }
}

/** Write a `src` the panel remembers dropping from the bound image at `path`,
 * making it fixed again in one batch — after the same size gate an import
 * passes, because ops never re-check the cap and undo/redo must stay able to
 * re-parse. Counted in UTF-8 bytes (the cap's unit): unlike an imported data
 * URI, a remembered bundled path may be non-ASCII. */
export function restoreImageSource(
  path: string,
  src: string,
  ctx: Pick<ImageImportContext, 'textBytes' | 'maxBytes' | 'applyAll' | 'setNotice'>,
): void {
  ctx.setNotice(null);
  const bytes = new TextEncoder().encode(src).length;
  if (!projectImport(ctx.textBytes, bytes, ctx.maxBytes).fits) {
    ctx.setNotice(capNotice(ctx.maxBytes));
    return;
  }
  ctx.applyAll(imageToFixedOps(path, src));
}

/** The over-cap notice: offer the next cap step, or say the ceiling is reached. */
function capNotice(maxBytes: number): string {
  return nextCapStep(maxBytes) === null ? 'image.notice.atMax' : 'image.notice.overCap';
}

/** Where a file dropped on the canvas inserts: the planned flow slot of the page
 * under the pointer, or the current insert target when the drop missed every
 * page. An image file drop is not a palette payload — it keeps the body-slot
 * planning it has always had (a cell drop is a bound-field gesture). */
export function dropInsertTarget(
  read: ReadFn,
  selection: string | null,
  hit: PageHit | null,
): InsertTarget {
  if (hit === null) {
    return resolveInsertTarget(read, selection);
  }
  return { path: BODY_ITEMS_PATH, index: planInsertDrop(read, hit.boxes, hit.point).index };
}
