// The preview underlay: one page's raw-RGBA pixels painted to a <canvas>. The
// canvas is attached via a callback ref so painting runs exactly when the
// element mounts (and re-runs when the page changes) with no null-ref guard
// branch that a normal `useRef` effect would leave uncovered.
//
// The raster and the CSS box are two different sizes on purpose: the engine
// rasterizes in DEVICE pixels and the element is laid out in CSS pixels, so on
// a 2x screen the canvas carries twice the pixels it occupies. Sizing the
// element from the raster alone — which is what an unstyled <canvas> does — is
// how the document ends up the only upscaled thing on a HiDPI screen.
//
// `cssSize` is OPTIONAL because the two consumers want opposite things: the
// canvas needs the page at an exact CSS size, and the document-settings
// preview deliberately lets a stylesheet fit the raster to the column it sits
// in. An inline size would win over that stylesheet, so a consumer that has
// already answered the question omits it.

import { useCallback } from 'react';
import type { RawPage } from '../engine/types';
import { paintPage } from './paint';

export interface PageUnderlayProps {
  readonly page: RawPage;
  /** The element's CSS box in px (`page.width ÷ the device pixel ratio`).
   * Omitted → no inline size, so the raster's own pixels lay the element out
   * unless CSS says otherwise. Both dimensions travel together: half an answer
   * would stretch the page. */
  readonly cssSize?: { readonly width: number; readonly height: number };
}

export function PageUnderlay({ page, cssSize }: PageUnderlayProps) {
  const attach = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (canvas !== null) {
        paintPage(canvas, page);
      }
    },
    [page],
  );
  return (
    <canvas
      ref={attach}
      width={page.width}
      height={page.height}
      style={cssSize === undefined ? undefined : { width: cssSize.width, height: cssSize.height }}
      className="sj-page-underlay"
    />
  );
}
