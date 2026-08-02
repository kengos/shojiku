// The zoom cluster ([−] [level select] [+]) that sits at the right end of the
// breadcrumb bar. Picking is safe, typing is dangerous: the
// select offers Fit and the discrete zoom stops as percentages, and the buttons
// step between them. When the live zoom sits between stops (after a fit or a
// ⌘-wheel), a leading read-only option shows its exact percent so the control
// never looks blank. All arithmetic lives in the pure `zoom` model.

import { useI18n } from '../i18n/context';
import { SELECT_SM } from '../ui/chrome';
import { isZoomStep, MAX_ZOOM, MIN_ZOOM, stepZoom, ZOOM_STEPS, zoomPercent } from './zoom';

const EPS = 1e-9;

const ZOOM_STEP =
  'min-w-[22px] cursor-pointer rounded-md border border-border bg-bg px-1.5 py-0.5 leading-none text-text disabled:cursor-default disabled:opacity-40';

export interface ZoomControlProps {
  readonly zoom: number;
  readonly onZoom: (zoom: number) => void;
  readonly onFit: () => void;
}

export function ZoomControl({ zoom, onZoom, onFit }: ZoomControlProps) {
  const { t } = useI18n();
  const exact = isZoomStep(zoom);
  const selectValue = exact ? String(zoom) : 'current';

  const change = (value: string) => {
    if (value === 'fit') {
      onFit();
      return;
    }
    // The read-only "current" option is already the state — selecting it is a
    // no-op (it exists only to label an off-step zoom).
    if (value !== 'current') {
      onZoom(Number(value));
    }
  };

  return (
    <div className="flex flex-none items-center gap-1">
      <button
        type="button"
        className={ZOOM_STEP}
        aria-label={t('zoom.out')}
        disabled={zoom <= MIN_ZOOM + EPS}
        onClick={() => onZoom(stepZoom(zoom, -1))}
      >
        −
      </button>
      <select
        className={SELECT_SM}
        aria-label={t('zoom.level')}
        value={selectValue}
        onChange={(event) => change(event.currentTarget.value)}
      >
        {exact ? null : <option value="current">{zoomPercent(zoom)}%</option>}
        <option value="fit">{t('zoom.fit')}</option>
        {ZOOM_STEPS.map((step) => (
          <option key={step} value={String(step)}>
            {Math.round(step * 100)}%
          </option>
        ))}
      </select>
      <button
        type="button"
        className={ZOOM_STEP}
        aria-label={t('zoom.in')}
        disabled={zoom >= MAX_ZOOM - EPS}
        onClick={() => onZoom(stepZoom(zoom, 1))}
      >
        +
      </button>
    </div>
  );
}
