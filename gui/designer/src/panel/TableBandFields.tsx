// The four controls one styled BAND of a table carries: alignment, background,
// text colour, bold. Rendered three times over three different key paths — the
// header row, the body rows, and (from `ColumnForm`) one column's cells — because
// they are the same four properties of `Style` in each case; only the path the
// caller writes to differs. Keeping them one component is what makes the column
// half of this feature nearly free.
//
// Every control shows its CASCADE-EFFECTIVE state, the format toolbar's
// semantics rather than the item's bare own keys: a column whose row band is
// bold shows a checked box, because that is what the page does. It follows that
// the ops must be cascade-aware too (`toolbar/wire`) — a control that renders an
// inherited value and then authors a raw set/clear either does nothing when
// clicked or makes the value jump.
//
// Where that value came from is told twice over, by weight:
//   - the DOCUMENT made it (a named style, an ancestor, `defaults.style`) → the
//     shared `OriginBadge` line, the decoration tab's own idiom;
//   - the ENGINE floor made it → a hover bubble over the whole FIELD, and the
//     control's `aria-describedby`. `textAlign`, `color` and `fontWeight`
//     always resolve to something, so a line apiece would be permanent chrome
//     on every band saying nothing — and for the same reason the origin is a
//     DESCRIPTION rather than part of the control's name, which a screen
//     reader re-reads on every visit.
// The header band's floor FILL is the deliberate exception and keeps its line:
// `#ededed` is a grey nobody authored and nobody expects, unlike `left`.
//
// Every row goes through the SAME field primitives and the same label class:
// mixing a shared primitive with hand-rolled columns is how a panel row ends up
// with three baselines and a stray margin.

import type { Op } from '@shojiku/designer-core';
import { useId } from 'react';
import type { I18n } from '../i18n/context';
import { useI18n } from '../i18n/context';
import type { CascadeContext } from '../toolbar/cascade';
import { type EffectiveValue, effectiveValueIn } from '../toolbar/effective';
import { originHint } from '../toolbar/fmtChrome';
import { BOLD_VALUE } from '../toolbar/model';
import { alignedValue, alignWire, comboWire, toggleWire } from '../toolbar/wire';
import { FIELD_LABEL } from '../ui/chrome';
import { IconAlignCenter, IconAlignLeft, IconAlignRight } from '../ui/icons';
import { Segmented } from '../ui/Segmented';
import { TipBubble } from '../ui/TipBubble';
import { documentOrigin } from './bandCascade';
import { OriginBadge } from './OriginBadge';
import { SwatchRow } from './ruleInputs';

/** The alignments the engine's `TextAlign` admits — three, not four; there is no
 * `justify` on the wire, so the control must not offer one. */
const ALIGNMENTS = ['left', 'center', 'right'] as const;

export interface TableBandFieldsProps {
  /** The band's OWN cascade context: its `style`/`styleNames` as the item, the
   * layers below it as ancestors (`panel/bandCascade` for the two bands,
   * `toolbar/cascade` for a column, which has a real path). */
  readonly ctx: CascadeContext;
  /** The op target path — the TABLE's for a band, the COLUMN's for a column. */
  readonly path: string;
  /** The key prefix under `path` this band owns: `['header', 'style']`,
   * `['row', 'style']`, or `['style']` for a column. */
  readonly keys: readonly string[];
  /** The header band's fill, which resolves to the engine's `#ededed` rather
   * than to nothing. Passing it swaps the background row's own resolution for
   * this one AND keeps its origin line even at the floor — the one place a
   * floor value is worth a line. */
  readonly headerFill?: EffectiveValue;
  readonly onOp: (op: Op | null) => void;
}

/** The three-way alignment control, shared by the band editors, the single-column
 * form, the column sheet's per-column row and the row-condition rule cards — one
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

export function TableBandFields({ ctx, path, keys, headerFill, onOp }: TableBandFieldsProps) {
  const { t } = useI18n();
  const at = (property: string) => [...keys, property];
  const align = effectiveValueIn(ctx, 'textAlign');
  const background = headerFill ?? effectiveValueIn(ctx, 'backgroundColor');
  const color = effectiveValueIn(ctx, 'color');
  const weight = effectiveValueIn(ctx, 'fontWeight');
  const boldHint = floorHint(t, weight);
  const alignHint = floorHint(t, align);
  const ids = useId();
  const alignHintId = `${ids}align`;
  const boldHintId = `${ids}bold`;
  return (
    <>
      {/* The hover group is the FIELD, so pointing at the control shows the
          origin; the bubble still hangs off the label span, the only `relative`
          box in the row. */}
      <div className="group/tip mb-2">
        <HintLabel label={t('panel.field.textAlign')} hint={alignHint} hintId={alignHintId} />
        <AlignSegment
          value={alignedValue(align.value)}
          describedBy={alignHint === undefined ? undefined : alignHintId}
          onChange={(value) => onOp(alignWire(path, at('textAlign'), align, value))}
        />
        <OriginLine effective={align} />
      </div>
      <SwatchRow
        label={t('panel.field.backgroundColor')}
        value={background.value}
        onCommit={(value) => onOp(comboWire(path, at('backgroundColor'), background, value, false))}
      />
      {/* The header fill keeps its line even at the engine FLOOR — `#ededed` is a
          grey nobody authored. Every other background still earns one when the
          DOCUMENT made it: `backgroundColor` reaches no ancestor layer, but a
          band's own `styleNames` do supply it (`namedValue` runs ahead of the
          inherited gate), and a colour arriving from a named style with nothing
          saying so is the same silence this section exists to remove. */}
      {headerFill === undefined ? (
        <OriginLine effective={background} />
      ) : (
        <OriginBadge effective={headerFill} />
      )}
      <SwatchRow
        label={t('panel.field.color')}
        value={color.value}
        hint={floorHint(t, color)}
        onCommit={(value) => onOp(comboWire(path, at('color'), color, value, false))}
      />
      <OriginLine effective={color} />
      {/* The bubble is a SIBLING of the label, never inside it. A `<label>`
          wrapping its input gives the control its name from the label's text
          CONTENT, so a bubble in there — no longer `aria-hidden`, because it is
          now a description — would be read as part of the name after all
          ("BoldFrom document defaults"), which is the exact thing describing it
          separately exists to avoid. */}
      <div className="group/tip relative mt-1 w-fit">
        <label className="flex items-center gap-1.5 text-sm text-text">
          <input
            type="checkbox"
            checked={weight.value === BOLD_VALUE}
            aria-describedby={boldHint === undefined ? undefined : boldHintId}
            onChange={(event) =>
              onOp(
                toggleWire(path, at('fontWeight'), weight, BOLD_VALUE, event.currentTarget.checked),
              )
            }
          />
          {t('panel.field.bold')}
        </label>
        {boldHint === undefined ? null : (
          <TipBubble text={boldHint} id={boldHintId} align="start" />
        )}
      </div>
      <OriginLine effective={weight} />
    </>
  );
}

/** The origin LINE, shown only for a value the document created. */
function OriginLine({ effective }: { readonly effective: EffectiveValue }) {
  return documentOrigin(effective) ? <OriginBadge effective={effective} /> : null;
}

/** A field label carrying the engine-floor origin as the gdoc-style bubble.
 * The bubble is DESCRIBED by the control (`hintId`) rather than folded into
 * its name; the hover group lives on the field wrapper, so the bubble shows
 * for the control as well as for the label. */
function HintLabel({
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
      <TipBubble text={hint} id={hintId} align="start" />
    </span>
  );
}

/** The origin hint for a value that came from the ENGINE floor, and only that:
 * a document-made value earns the line instead, and own/unset values have
 * nothing to say. */
function floorHint(t: I18n['t'], eff: EffectiveValue): string | undefined {
  return eff.origin === 'engine' ? originHint(t, eff) : undefined;
}

function alignIcon(value: (typeof ALIGNMENTS)[number]) {
  if (value === 'left') {
    return <IconAlignLeft size={15} />;
  }
  return value === 'center' ? <IconAlignCenter size={15} /> : <IconAlignRight size={15} />;
}
