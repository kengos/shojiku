// The real browser image codec: `<img>` decode + `<canvas>` re-encode, the DOM
// glue the Designer's image import takes as an injected dependency. Part of the
// browser-entry group (`src/browser/`, coverage-excluded with `main.tsx`) —
// jsdom has no canvas/Image decode, so the pipeline is unit-tested with a fake
// codec and this real one is exercised only in a real browser.

import type { ImageCodec } from '@shojiku/designer';

const RASTER_MIME: Record<'png' | 'jpeg', string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
};

/** Decode raster bytes into an `HTMLImageElement`, or `null` if the browser
 * cannot decode them (a corrupt file). The object URL is always revoked. */
function loadRasterImage(bytes: Uint8Array, mime: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** The real browser image codec (the injected DOM glue for image import): reads
 * a File's bytes, probes raster dimensions via `Image`, and downscales via a
 * `<canvas>` re-encode. */
export const browserImageCodec: ImageCodec = {
  async read(file) {
    return new Uint8Array(await file.arrayBuffer());
  },
  async probe(bytes, kind) {
    const img = await loadRasterImage(bytes, RASTER_MIME[kind]);
    return img === null ? null : { w: img.naturalWidth, h: img.naturalHeight };
  },
  async reencode(bytes, kind, target, quality) {
    const img = await loadRasterImage(bytes, RASTER_MIME[kind]);
    if (img === null) {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = target.w;
    canvas.height = target.h;
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      return null;
    }
    ctx.drawImage(img, 0, 0, target.w, target.h);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), RASTER_MIME[kind], quality);
    });
    return blob === null ? null : new Uint8Array(await blob.arrayBuffer());
  },
};
