// The empty-body prompt over the canvas: when the body holds no item, one line
// saying so and the action that fixes it. Split out of `CanvasArea.tsx` when
// the copy notice pushed that file past the per-file budget; it reads the
// document itself so the area only places it.

import type { ReadFn } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import { hasNoBodyItems } from '../insert/model';
import { Button } from '../ui/Button';

export interface CanvasEmptyStateProps {
  readonly read: ReadFn;
  /** Insert a text item — the action the empty state offers. */
  readonly onInsertText: () => void;
}

export function CanvasEmptyState({ read, onInsertText }: CanvasEmptyStateProps) {
  const { t } = useI18n();
  if (!hasNoBodyItems(read)) {
    return null;
  }
  return (
    <div className="absolute top-24 left-1/2 w-fit max-w-[80%] -translate-x-1/2 rounded-md border border-dashed border-border bg-surface px-4 py-3 text-center text-text shadow-[0_4px_12px_rgb(0_0_0/0.12)]">
      <p className="m-0 mb-2">{t('canvas.empty')}</p>
      {/* The one filled control on the WORK SURFACE, and the documented
          exception to "a canvas screen carries no primary": in an empty
          state it is the only thing on the page, so it IS that screen's
          primary. gui/STYLE.md § Actions carries the rule and this
          exception; `Designer.test.tsx` pins it. */}
      <Button variant="primary" onClick={onInsertText}>
        {t('canvas.emptyAction')}
      </Button>
    </div>
  );
}
