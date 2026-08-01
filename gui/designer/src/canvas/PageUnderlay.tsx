// The preview underlay: one page's raw-RGBA pixels painted to a <canvas>. The
// canvas is attached via a callback ref so painting runs exactly when the
// element mounts (and re-runs when the page changes) with no null-ref guard
// branch that a normal `useRef` effect would leave uncovered.

import { useCallback } from 'react';
import type { RawPage } from '../engine/types';
import { paintPage } from './paint';

export interface PageUnderlayProps {
  readonly page: RawPage;
}

export function PageUnderlay({ page }: PageUnderlayProps) {
  const attach = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (canvas !== null) {
        paintPage(canvas, page);
      }
    },
    [page],
  );
  return (
    <canvas ref={attach} width={page.width} height={page.height} className="sj-page-underlay" />
  );
}
