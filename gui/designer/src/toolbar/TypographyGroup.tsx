// The format toolbar's typography cluster — gdoc's font group: family
// dropdown, `− size +`, then bold/italic behind a thin rule. Rendered only for
// a text target (the other boxed types get fill + border only), so the whole
// group is one unit the shell shows or hides.
//
// The size field is a change-guarded commit-on-blur input flanked by ±1pt
// steppers; the steppers act on a PLAIN-NUMBER effective size only (a unit
// string or an empty resolution disables them while the input stays editable).

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import { useReseedKey } from '../panel/useReseedKey';
import { TOUR_ANCHORS } from '../tutorial/anchors';
import { TipBubble } from '../ui/TipBubble';
import { FamilyControl } from './FamilyControl';
import { FMT_BTN, hintTitle, originHint, Sep, ToggleButton } from './fmtChrome';
import { fontFamilyOp, fontSizeOp, fontStyleOp, fontWeightOp, type ToolbarModel } from './model';

export function TypographyGroup({
  model,
  path,
  fontFamilies,
  onAddFont,
  dispatch,
}: {
  readonly model: ToolbarModel;
  readonly path: string;
  readonly fontFamilies: readonly string[];
  readonly onAddFont?: () => void;
  readonly dispatch: (op: Op | null) => void;
}) {
  const { t } = useI18n();
  // ±1pt per click, floored at 1, rounded to one decimal so a fractional size
  // (10.5) steps cleanly.
  const sizeEff = model.eff.fontSize;
  const [sizeKey, reseedSize] = useReseedKey(sizeEff.value);
  const sizeNum = /^\d+(\.\d+)?$/.test(sizeEff.value) ? Number(sizeEff.value) : null;
  const stepSize = (dir: 1 | -1) =>
    sizeNum === null
      ? undefined
      : () =>
          dispatch(
            fontSizeOp(path, sizeEff, String(Math.max(1, Math.round((sizeNum + dir) * 10) / 10))),
          );

  return (
    <>
      <FamilyControl
        eff={model.eff.fontFamily}
        options={fontFamilies}
        onPick={(name) => dispatch(fontFamilyOp(path, model.eff.fontFamily, name))}
        onAddFont={onAddFont}
      />
      <span className="group/tip relative inline-flex">
        <button
          type="button"
          className={FMT_BTN}
          aria-label={t('toolbar.sizeDown')}
          disabled={sizeNum === null}
          onClick={stepSize(-1)}
        >
          −
        </button>
        <TipBubble text={t('toolbar.sizeDown')} />
      </span>
      {/* No datalist here (gdoc's size box has none, and Chrome reserves
          indicator room inside the input that clips "10.5"); presets step
          via the −/+ buttons, free entry stays. */}
      <span className="group/tip relative inline-flex">
        <input
          key={sizeKey}
          className="h-8 w-14 rounded-md border border-border bg-bg px-1 text-center text-sm text-text"
          type="text"
          data-tour={TOUR_ANCHORS.toolbarFontSize}
          aria-label={t('toolbar.fontSize')}
          defaultValue={sizeEff.value}
          onBlur={(event) => {
            const typed = event.currentTarget.value;
            // `fontSizeOp` authors nothing when the box is cleared on a field
            // with no own value — clearing an inherited size has no key to
            // remove — so the typed whitespace has to be taken back.
            if (typed !== sizeEff.value) {
              dispatch(fontSizeOp(path, sizeEff, typed));
              reseedSize();
            }
          }}
        />
        <TipBubble text={hintTitle(t('toolbar.fontSize'), originHint(t, sizeEff))} />
      </span>
      <span className="group/tip relative inline-flex">
        <button
          type="button"
          className={FMT_BTN}
          aria-label={t('toolbar.sizeUp')}
          disabled={sizeNum === null}
          onClick={stepSize(1)}
        >
          +
        </button>
        <TipBubble text={t('toolbar.sizeUp')} />
      </span>
      <Sep />
      <ToggleButton
        label={t('toolbar.bold')}
        tour={TOUR_ANCHORS.toolbarBold}
        glyph={<span className="font-bold">B</span>}
        pressed={model.bold}
        hint={originHint(t, model.eff.fontWeight)}
        onToggle={(next) => dispatch(fontWeightOp(path, model.eff.fontWeight, next))}
      />
      <ToggleButton
        label={t('toolbar.italic')}
        glyph={<span className="font-serif italic">I</span>}
        pressed={model.italic}
        hint={originHint(t, model.eff.fontStyle)}
        onToggle={(next) => dispatch(fontStyleOp(path, model.eff.fontStyle, next))}
      />
    </>
  );
}
