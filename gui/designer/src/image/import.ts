// The image-import orchestration over an injected `ImageCodec`: read the file's
// bytes, sniff the format, decide accept/downscale/refuse via the pure model,
// re-encode when downscaling, and compose the `data:` URI. The DOM-bound work
// (reading a File, probing raster dimensions, canvas re-encoding) is the codec's
// — host-injected from the app's browser-globals entry so this module stays
// jsdom-testable with a fake, and the real canvas glue never needs coverage
// here (it can't run under jsdom). Nothing here parses SVG or trusts a MIME.

import { composeDataUri } from './dataUri';
import {
  type ImageBudgets,
  type ImageKind,
  type ImportRefusal,
  importPlan,
  type ProbeKind,
  type RasterKind,
  sniffImage,
} from './model';

/** The DOM-bound operations image import needs, injected by the host. A raster
 * probe/re-encode uses `Image`/`<canvas>` (absent under jsdom); a fake supplies
 * these in tests. */
export interface ImageCodec {
  /** The file's raw bytes. */
  read(file: Blob): Promise<Uint8Array>;
  /** Intrinsic pixel dimensions of a raster, or `null` if it cannot be decoded
   * (a truncated/corrupt file that still sniffed as a known format). Accepts
   * every measurable kind, GIF and WebP included — browsers decode both, and
   * the default draw box needs their pixel size even though `reencode` can
   * never be asked for one. */
  probe(bytes: Uint8Array, kind: ProbeKind): Promise<{ w: number; h: number } | null>;
  /** Re-encode a raster downscaled to `target` at `quality`, keeping the format,
   * or `null` on any failure. */
  reencode(
    bytes: Uint8Array,
    kind: RasterKind,
    target: { readonly w: number; readonly h: number },
    quality: number,
  ): Promise<Uint8Array | null>;
}

/** The result of importing one file. */
export type ImportOutcome =
  | {
      readonly ok: true;
      readonly kind: ImageKind;
      /** The composed `data:` URI for the `image` item's `src`. */
      readonly src: string;
      /** Intrinsic pixel dims (raster; `null` for SVG) — seeds the default box. */
      readonly intrinsic: { readonly w: number; readonly h: number } | null;
      /** Whether the raster was downscaled to fit the byte budget. */
      readonly downscaled: boolean;
    }
  | { readonly ok: false; readonly reason: ImportRefusal };

/** Import one image file: sniff → plan → (re-encode) → compose. Never throws for
 * a bad image — every failure is a typed `ImportRefusal` the caller localizes.
 * A codec `read`/`probe`/`reencode` rejection surfaces as `decode_failed`. */
export async function importImageFile(
  file: Blob,
  codec: ImageCodec,
  budgets: ImageBudgets,
): Promise<ImportOutcome> {
  let bytes: Uint8Array;
  try {
    bytes = await codec.read(file);
  } catch {
    return { ok: false, reason: 'decode_failed' };
  }
  const kind = sniffImage(bytes);
  if (kind === null) {
    return { ok: false, reason: 'unsupported_format' };
  }
  if (kind === 'svg') {
    const plan = importPlan('svg', bytes.length, null, budgets);
    return plan.action === 'refuse'
      ? { ok: false, reason: plan.reason }
      : {
          ok: true,
          kind: 'svg',
          src: composeDataUri('svg', bytes),
          intrinsic: null,
          downscaled: false,
        };
  }
  return importRaster(bytes, kind, codec, budgets);
}

async function importRaster(
  bytes: Uint8Array,
  kind: ProbeKind,
  codec: ImageCodec,
  budgets: ImageBudgets,
): Promise<ImportOutcome> {
  let intrinsic: { w: number; h: number } | null;
  try {
    intrinsic = await codec.probe(bytes, kind);
  } catch {
    return { ok: false, reason: 'decode_failed' };
  }
  const plan = importPlan(kind, bytes.length, intrinsic, budgets);
  if (plan.action === 'refuse') {
    return { ok: false, reason: plan.reason };
  }
  if (plan.action === 'accept') {
    return { ok: true, kind, src: composeDataUri(kind, bytes), intrinsic, downscaled: false };
  }
  // Downscale: re-encode to the planned dimensions, then confirm it now fits.
  let reencoded: Uint8Array | null;
  try {
    reencoded = await codec.reencode(bytes, plan.kind, plan.target, plan.quality);
  } catch {
    return { ok: false, reason: 'decode_failed' };
  }
  if (reencoded === null) {
    return { ok: false, reason: 'decode_failed' };
  }
  if (reencoded.length > budgets.maxImageBytes) {
    return { ok: false, reason: 'too_large' };
  }
  return {
    ok: true,
    kind,
    src: composeDataUri(kind, reencoded),
    intrinsic: plan.target,
    downscaled: true,
  };
}
