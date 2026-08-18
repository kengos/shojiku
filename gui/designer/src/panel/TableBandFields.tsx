// The four controls one styled BAND of a table carries: alignment, background,
// text colour, bold. Rendered three times over three different key paths — the
// header row, the body rows, and (from `ColumnForm`) one column's cells — because
// they are the same four properties of `Style` in each case; only the path the
// caller writes to differs. Keeping them one component is what makes the column
// half of this feature nearly free, and it is why the caller passes an
// `onChange(property, value)` rather than pre-bound handlers.
//
// Every row goes through the SAME field primitives and the same label class:
// mixing a shared primitive with hand-rolled columns is how a panel row ends up
// with three baselines and a stray margin.

import { useI18n } from '../i18n/context';
import type { EffectiveValue } from '../toolbar/effective';
import { FIELD_LABEL } from '../ui/chrome';
import { IconAlignCenter, IconAlignLeft, IconAlignRight } from '../ui/icons';
import { Segmented } from '../ui/Segmented';
import { OriginBadge } from './OriginBadge';
import { SwatchRow } from './ruleInputs';
import type { BandProperty, BandView } from './tableStyleModel';

/** The alignments the engine's `TextAlign` admits — three, not four; there is no
 * `justify` on the wire, so the control must not offer one. */
const ALIGNMENTS = ['left', 'center', 'right'] as const;

export interface TableBandFieldsProps {
  readonly band: BandView;
  /** When set, the background row renders this effective value's origin line
   * instead of nothing — the header band's unset fill resolves to the engine's
   * `#ededed`, and a bare swatch would not say so. */
  readonly backgroundEffective?: EffectiveValue;
  readonly onChange: (property: BandProperty, value: string) => void;
}

/** The three-way alignment control, shared by the band editors, the single-column
 * form and the column sheet's per-column row — one control, one vocabulary, one
 * set of glyphs, wherever a `textAlign` is picked. */
export function AlignSegment({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <Segmented
      ariaLabel={t('panel.field.textAlign')}
      value={value}
      options={ALIGNMENTS.map((option) => ({
        value: option,
        label: t(`style.value.textAlign.${option}`),
        icon: alignIcon(option),
      }))}
      // A native radio fires no change for the already-checked option, so a
      // re-pick of the active alignment authors nothing.
      onChange={onChange}
    />
  );
}

export function TableBandFields({ band, backgroundEffective, onChange }: TableBandFieldsProps) {
  const { t } = useI18n();
  return (
    <>
      <div className="mb-2">
        <span className={FIELD_LABEL}>{t('panel.field.textAlign')}</span>
        <AlignSegment value={band.textAlign} onChange={(value) => onChange('textAlign', value)} />
      </div>
      <SwatchRow
        label={t('panel.field.backgroundColor')}
        value={backgroundEffective?.value ?? band.backgroundColor}
        onCommit={(value) => onChange('backgroundColor', value)}
      />
      {backgroundEffective === undefined ? null : <OriginBadge effective={backgroundEffective} />}
      <SwatchRow
        label={t('panel.field.color')}
        value={band.color}
        onCommit={(value) => onChange('color', value)}
      />
      <label className="mt-1 flex items-center gap-1.5 text-sm text-text">
        <input
          type="checkbox"
          checked={band.fontWeight === 'bold'}
          onChange={(event) => onChange('fontWeight', event.currentTarget.checked ? 'bold' : '')}
        />
        {t('panel.field.bold')}
      </label>
    </>
  );
}

function alignIcon(value: (typeof ALIGNMENTS)[number]) {
  if (value === 'left') {
    return <IconAlignLeft size={15} />;
  }
  return value === 'center' ? <IconAlignCenter size={15} /> : <IconAlignRight size={15} />;
}
