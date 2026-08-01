// The document-level sample controls above the detail pane: the variant bar, the
// panel-local sample undo, and the generate CTA offered only while the schema
// declares fields the params lack.
//
// All three act on the sample DOCUMENT rather than the selected field, so they
// live above the selection and disappear together when a mounted host owns the
// params (the read-only hint takes their place).

import { useI18n } from '../i18n/context';
import { BTN_SM } from '../ui/chrome';
import { VariantBar, type VariantControls } from './VariantBar';

export interface SampleControlsProps {
  readonly canEditSample: boolean;
  readonly variants?: VariantControls;
  readonly canUndo: boolean;
  readonly onUndo?: () => void;
  /** The schema declares top-level keys the params lack. */
  readonly showGenerate: boolean;
  readonly onGenerate: () => void;
}

export function SampleControls({
  canEditSample,
  variants,
  canUndo,
  onUndo,
  showGenerate,
  onGenerate,
}: SampleControlsProps) {
  const { t } = useI18n();
  if (!canEditSample) {
    return <p className="m-0 text-sm text-muted">{t('sample.readOnlyHint')}</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {variants !== undefined ? <VariantBar {...variants} /> : null}
      {onUndo !== undefined ? (
        <button type="button" className={BTN_SM} disabled={!canUndo} onClick={onUndo}>
          {t('sample.undo')}
        </button>
      ) : null}
      {showGenerate ? (
        <button type="button" className={BTN_SM} onClick={onGenerate}>
          {t('sample.generate')}
        </button>
      ) : null}
    </div>
  );
}
