// The controls one styled BAND of a table carries, in Google's format-toolbar
// order: font family, size, bold, italic, text colour, background, horizontal
// alignment and — where the engine honours it — vertical alignment. Rendered
// over five different key paths: the header row, the body rows, one column's
// cells (`ColumnForm`), one row-condition rule, and one header group — because
// they are the same `Style` properties in each case; only the path the caller
// writes to differs. The table's own 「文字」 section renders it too, without the
// background (a table fill is never painted).
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
// Vertical alignment is offered only where the HOST says it reaches the page:
// a body cell takes its column's value alone (`engine/layout/src/engine/table/
// rows/prepare.rs`), so a `verticalAlign` on the body band, a rule or the table
// itself would be a control that changes nothing.

import type { Op } from '@shojiku/designer-core';
import { useId } from 'react';
import { useI18n } from '../i18n/context';
import type { CascadeContext } from '../toolbar/cascade';
import { type EffectiveValue, effectiveValueIn } from '../toolbar/effective';
import { BOLD_VALUE, ITALIC_VALUE } from '../toolbar/model';
import { alignedValue, alignWire, comboWire, toggleWire } from '../toolbar/wire';
import { FIELD_LABEL } from '../ui/chrome';
import { BandTypeFields } from './BandTypeFields';
import {
  AlignSegment,
  BandToggle,
  floorHint,
  HintLabel,
  OriginLine,
  TABLE_VALIGN_DEFAULT,
  VAlignSegment,
} from './bandFieldParts';
import { OriginBadge } from './OriginBadge';
import { SwatchRow } from './ruleInputs';

/** The capability an engine declares when a table honours an authored
 * `verticalAlign` on `header.style`, on a header group, and on a column for its
 * own LABEL cell. A column's BODY cells read their column's value too, but the
 * key does not promise that, so the column control stays behind the same gate:
 * against an older engine it is withheld rather than offered on a guess. */
export const TABLE_VALIGN_CAPABILITY = 'table.header.style.verticalAlign';

/** What the band's HOST decides about the control set — one bundle, so every
 * caller states the same three facts about where it sits. */
export interface BandFieldsHost {
  /** The host's font families, offered as the family field's suggestions. */
  readonly fontFamilies: readonly string[];
  /** Whether this host's vertical alignment reaches the page AND the engine
   * declares it (`table.header.style.verticalAlign`): the header band, a
   * column and a header group, never the body band, a rule or the table. */
  readonly verticalAlign: boolean;
  /** Whether the background control belongs here — false for the table's own
   * style, which the engine never paints. */
  readonly fill: boolean;
}

export interface TableBandFieldsProps {
  /** The band's OWN cascade context: its `style`/`styleNames` as the item, the
   * layers below it as ancestors (`panel/bandCascade` for the bands, a rule and
   * a group; `toolbar/cascade` for a column, which has a real path). */
  readonly ctx: CascadeContext;
  /** The op target path — the TABLE's for a band, the COLUMN's, the RULE
   * entry's or the GROUP's for those. */
  readonly path: string;
  /** The key prefix under `path` this band owns: `['header', 'style']`,
   * `['row', 'style']`, or `['style']` for a column, a rule, a group and the
   * table itself. */
  readonly keys: readonly string[];
  readonly host: BandFieldsHost;
  /** A fill that resolves to an engine floor rather than to nothing (the header
   * band's `#ededed`, a header group's band fill). Passing it swaps the
   * background row's own resolution for this one AND keeps its origin line even
   * at the floor — the one place a floor value is worth a line. */
  readonly headerFill?: EffectiveValue;
  readonly onOp: (op: Op | null) => void;
}

export function TableBandFields({ ctx, path, keys, host, headerFill, onOp }: TableBandFieldsProps) {
  const { t } = useI18n();
  const at = (property: string) => [...keys, property];
  const align = effectiveValueIn(ctx, 'textAlign');
  const valign = effectiveValueIn(ctx, 'verticalAlign');
  const background = headerFill ?? effectiveValueIn(ctx, 'backgroundColor');
  const color = effectiveValueIn(ctx, 'color');
  const alignHint = floorHint(t, align);
  const alignHintId = `${useId()}align`;
  return (
    <>
      <BandTypeFields
        ctx={ctx}
        path={path}
        keys={keys}
        fontFamilies={host.fontFamilies}
        onOp={onOp}
      />
      <BandToggle
        ctx={ctx}
        property="fontWeight"
        onValue={BOLD_VALUE}
        label={t('panel.field.bold')}
        onToggle={(eff, on) => onOp(toggleWire(path, at('fontWeight'), eff, BOLD_VALUE, on))}
      />
      <BandToggle
        ctx={ctx}
        property="fontStyle"
        onValue={ITALIC_VALUE}
        label={t('panel.field.italic')}
        onToggle={(eff, on) => onOp(toggleWire(path, at('fontStyle'), eff, ITALIC_VALUE, on))}
      />
      <SwatchRow
        label={t('panel.field.color')}
        value={color.value}
        hint={floorHint(t, color)}
        onCommit={(value) => onOp(comboWire(path, at('color'), color, value, false))}
      />
      <OriginLine effective={color} />
      {host.fill ? (
        <>
          <SwatchRow
            label={t('panel.field.backgroundColor')}
            value={background.value}
            onCommit={(value) =>
              onOp(comboWire(path, at('backgroundColor'), background, value, false))
            }
          />
          {/* A floor fill keeps its line (see the header note); every other
              background earns one only when the DOCUMENT made it — a band's own
              `styleNames` do supply one, and a colour arriving from a named style
              with nothing saying so is the silence this section removes. */}
          {headerFill === undefined ? (
            <OriginLine effective={background} />
          ) : (
            <OriginBadge effective={headerFill} />
          )}
        </>
      ) : null}
      {/* The hover group is the FIELD, so pointing at the control shows the
          origin; the bubble still hangs off the label span, the only `relative`
          box in the row. */}
      <div className="group/tip mt-2 mb-2">
        <HintLabel label={t('panel.field.textAlign')} hint={alignHint} hintId={alignHintId} />
        <AlignSegment
          value={alignedValue(align.value)}
          describedBy={alignHint === undefined ? undefined : alignHintId}
          onChange={(value) => onOp(alignWire(path, at('textAlign'), align, value))}
        />
        <OriginLine effective={align} />
      </div>
      {host.verticalAlign ? (
        <div className="mb-2">
          <span className={FIELD_LABEL}>{t('panel.field.verticalAlign')}</span>
          <VAlignSegment
            value={alignedValue(valign.value, TABLE_VALIGN_DEFAULT)}
            onChange={(value) =>
              onOp(alignWire(path, at('verticalAlign'), valign, value, TABLE_VALIGN_DEFAULT))
            }
          />
          <OriginLine effective={valign} />
        </div>
      ) : null}
    </>
  );
}
