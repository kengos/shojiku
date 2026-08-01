// The page-thumbnail navigation rail: one downscaled preview per page, the
// current page highlighted, clicking a thumbnail jumps the canvas to it. Shown
// only for multi-page documents (the caller gates on page count). Pure view
// chrome — it reads the same last-good pages the canvas paints and reports a
// jump intent; it never touches the document (no op, nothing in the template).
//
// A thumbnail paints the page's full-resolution RGBA to a <canvas> (reusing
// `paintPage`) and lets CSS downscale it to the rail width, so it always
// matches the real preview without a second rasterizer.

import { useCallback } from 'react';
import type { RawPage } from '../engine/types';
import { useI18n } from '../i18n/context';
import { paintPage } from './paint';

/** Rail thumbnail width in CSS px; the canvas keeps the page's aspect ratio. */
const THUMB_WIDTH = 88;

export interface PageRailProps {
  readonly pages: readonly RawPage[];
  /** Index of the page currently in view (highlighted). */
  readonly current: number;
  /** Jump the canvas to the page at `index`. */
  readonly onJump: (index: number) => void;
}

/** One page's downscaled preview, painted via a callback ref so it renders
 * exactly on mount / page change with no null-ref guard branch to leave
 * uncovered (the `PageUnderlay` pattern). */
function Thumbnail({ page }: { readonly page: RawPage }) {
  const attach = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (canvas !== null) {
        paintPage(canvas, page);
      }
    },
    [page],
  );
  const height = page.width > 0 ? (THUMB_WIDTH * page.height) / page.width : THUMB_WIDTH;
  return (
    <canvas
      ref={attach}
      width={page.width}
      height={page.height}
      className="block bg-surface"
      style={{ width: THUMB_WIDTH, height }}
    />
  );
}

export function PageRail({ pages, current, onJump }: PageRailProps) {
  const { t } = useI18n();
  return (
    <nav
      aria-label={t('pageRail.label')}
      className="flex min-h-0 shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-border bg-chrome px-2 py-3"
    >
      {pages.map((page, index) => {
        const active = index === current;
        return (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: pages are a stable, order-preserving list with no identity of their own — the index is their key.
            key={`thumb-${index}`}
            type="button"
            aria-label={t('pageRail.page', { n: index + 1 })}
            aria-current={active ? 'true' : undefined}
            onClick={() => onJump(index)}
            className={`flex cursor-pointer flex-col items-center gap-1 rounded-md border bg-surface p-1 shadow-[0_1px_4px_var(--sj-paper-shadow)] ${
              active ? 'border-accent ring-1 ring-accent' : 'border-border'
            }`}
          >
            <Thumbnail page={page} />
            <span className={`text-xs ${active ? 'text-accent' : 'text-muted'}`}>{index + 1}</span>
          </button>
        );
      })}
    </nav>
  );
}
