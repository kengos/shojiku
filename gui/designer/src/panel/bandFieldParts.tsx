// The small parts every styled-band control row is built from: the horizontal
// and vertical alignment segments, the on/off checkbox (bold, italic), the field
// label that carries an engine-floor origin bubble, and the origin LINE a
// document-made value earns. Split out of
// `TableBandFields` (which composes them into the band's control set) so the
// type-face row (`BandTypeFields`) and the column sheet's per-column row
// (`TableColumnCells`) reach the same parts without importing the whole set.

import { useId } from 'react';
import type { I18n } from '../i18n/context';
import { useI18n } from '../i18n/context';
import type { CascadeContext } from '../toolbar/cascade';
import { type EffectiveValue, effectiveValueIn } from '../toolbar/effective';
import { originHint } from '../toolbar/fmtChrome';
import { FIELD_LABEL } from '../ui/chrome';
import {
  IconAlignBottom,
  IconAlignCenter,
  IconAlignLeft,
  IconAlignMiddle,
  IconAlignRight,
  IconAlignTop,
} from '../ui/icons';
import { Segmented } from '../ui/Segmented';
import { TipBubble } from '../ui/TipBubble';
import { documentOrigin } from './bandCascade';
import { OriginBadge } from './OriginBadge';

/** The alignments the engine's `TextAlign` admits — three, not four; there is no
 * `justify` on the wire, so the control must not offer one. */
const ALIGNMENTS = ['left', 'center', 'right'] as const;

/** The engine's `VerticalAlign` (`engine/core/src/style/enums.rs`), in
 * declaration order. A table row's cells default to `middle`. */
const VERTICAL_ALIGNMENTS = ['top', 'middle', 'bottom'] as const;

/** What an unset vertical alignment means inside a table row. */
export const TABLE_VALIGN_DEFAULT = 'middle';

/** The three-way alignment control, shared by the band editors, the single-column
 * form, the column sheet's per-column row and the row-condition rules — one
 * control, one vocabulary, one set of glyphs, wherever a `textAlign` is picked. */
export function AlignSegment({
  value,
  describedBy,
  onChange,
}: {
  readonly value: string;
  /** The id of the field's origin bubble, where there is one to point at. */
  readonly describedBy?: string;
  readonly onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <Segmented
      ariaLabel={t('panel.field.textAlign')}
      describedBy={describedBy}
      value={value}
      options={ALIGNMENTS.map((option) => ({
        value: option,
        label: t(`style.value.textAlign.${option}`),
        icon: alignIcon(option),
      }))}
      // A native radio fires no change for the already-checked option, so
      // re-picking the alignment the cascade already yields authors nothing —
      // which is the same outcome `alignWire` would reach anyway.
      onChange={onChange}
    />
  );
}

/** The top / middle / bottom control — `AlignSegment`'s vertical twin. */
export function VAlignSegment({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <Segmented
      ariaLabel={t('panel.field.verticalAlign')}
      value={value}
      options={VERTICAL_ALIGNMENTS.map((option) => ({
        value: option,
        label: t(`style.value.verticalAlign.${option}`),
        icon: valignIcon(option),
      }))}
      onChange={onChange}
    />
  );
}

/** The origin LINE, shown only for a value the document created. */
export function OriginLine({ effective }: { readonly effective: EffectiveValue }) {
  return documentOrigin(effective) ? <OriginBadge effective={effective} /> : null;
}

/** A field label carrying the engine-floor origin as the gdoc-style bubble.
 * The bubble is DESCRIBED by the control (`hintId`) rather than folded into
 * its name; the hover group lives on the field wrapper, so the bubble shows
 * for the control as well as for the label. */
export function HintLabel({
  label,
  hint,
  hintId,
}: {
  readonly label: string;
  readonly hint: string | undefined;
  readonly hintId: string;
}) {
  if (hint === undefined) {
    return <span className={FIELD_LABEL}>{label}</span>;
  }
  return (
    <span className={`${FIELD_LABEL} relative w-fit`}>
      {label}
      <TipBubble text={hint} id={hintId} />
    </span>
  );
}

/** The origin hint for a value that came from the ENGINE floor, and only that:
 * a document-made value earns the line instead, and own/unset values have
 * nothing to say. */
export function floorHint(t: I18n['t'], eff: EffectiveValue): string | undefined {
  return eff.origin === 'engine' ? originHint(t, eff) : undefined;
}

function alignIcon(value: (typeof ALIGNMENTS)[number]) {
  if (value === 'left') {
    return <IconAlignLeft size={15} />;
  }
  return value === 'center' ? <IconAlignCenter size={15} /> : <IconAlignRight size={15} />;
}

function valignIcon(value: (typeof VERTICAL_ALIGNMENTS)[number]) {
  if (value === 'top') {
    return <IconAlignTop size={15} />;
  }
  return value === 'middle' ? <IconAlignMiddle size={15} /> : <IconAlignBottom size={15} />;
}

/** One on/off property (bold, italic) as a checkbox over its effective value.
 * The bubble is a SIBLING of the label, never inside it: a `<label>` wrapping
 * its input takes its name from its text CONTENT, so a bubble in there would be
 * read as part of the name ("BoldFrom document defaults"). */
export function BandToggle({
  ctx,
  property,
  onValue,
  label,
  onToggle,
}: {
  readonly ctx: CascadeContext;
  readonly property: string;
  readonly onValue: string;
  readonly label: string;
  readonly onToggle: (eff: EffectiveValue, on: boolean) => void;
}) {
  const { t } = useI18n();
  const eff = effectiveValueIn(ctx, property);
  const hint = floorHint(t, eff);
  const hintId = useId();
  return (
    <>
      <div className="group/tip relative mt-1 w-fit">
        <label className="flex items-center gap-1.5 text-sm text-text">
          <input
            type="checkbox"
            checked={eff.value === onValue}
            aria-describedby={hint === undefined ? undefined : hintId}
            onChange={(event) => onToggle(eff, event.currentTarget.checked)}
          />
          {label}
        </label>
        {hint === undefined ? null : <TipBubble text={hint} id={hintId} />}
      </div>
      <OriginLine effective={eff} />
    </>
  );
}
