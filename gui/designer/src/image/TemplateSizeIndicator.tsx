// The template-size headroom indicator shown in the canvas topbar while an
// image-bearing template is edited: the used fraction of the current cap and,
// once it nears the limit, the raise prompt (with the trade-off spelled out) —
// or, when no raise is available (at the ceiling), a hint to use a smaller
// image. Presentational over the pure `headroom` model; the Designer owns
// computing the next cap step and applying it.

import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { BTN } from '../ui/chrome';
import { headroom } from './capacity';

export interface TemplateSizeIndicatorProps {
  /** Current serialized template size (bytes). */
  readonly templateBytes: number;
  /** The active template-size cap (bytes). */
  readonly maxBytes: number;
  /** Raise the cap (already resolved to the next step). Absent = at the ceiling,
   * so the near-cap state shows the "use a smaller image" hint instead. */
  readonly onRaise?: () => void;
}

export function TemplateSizeIndicator({
  templateBytes,
  maxBytes,
  onRaise,
}: TemplateSizeIndicatorProps) {
  const { t } = useI18n();
  const [promptOpen, setPromptOpen] = useState(false);
  const { ratio, level } = headroom(templateBytes, maxBytes);
  const percent = Math.round(ratio * 100);

  return (
    <div className="flex shrink-0 items-center gap-2 text-sm text-muted">
      <output className={level === 'warn' ? 'font-semibold text-warn-text' : undefined}>
        {`${t('image.headroom.label')} ${percent}%`}
      </output>
      {level === 'warn' && onRaise === undefined ? <span>{t('image.headroom.atMax')}</span> : null}
      {level === 'warn' && onRaise !== undefined ? (
        promptOpen ? (
          <span className="flex items-center gap-1">
            <span className="max-w-[22rem]">{t('image.headroom.tradeoff')}</span>
            <button
              type="button"
              className={BTN}
              onClick={() => {
                setPromptOpen(false);
                onRaise();
              }}
            >
              {t('image.headroom.confirm')}
            </button>
            <button type="button" className={BTN} onClick={() => setPromptOpen(false)}>
              {t('image.headroom.cancel')}
            </button>
          </span>
        ) : (
          <button type="button" className={BTN} onClick={() => setPromptOpen(true)}>
            {t('image.headroom.raise')}
          </button>
        )
      ) : null}
    </div>
  );
}
