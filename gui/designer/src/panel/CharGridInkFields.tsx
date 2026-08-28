// The ink controls of the manuscript-grid section: the ruling that draws the cells,
// the ruby size, and the line-breaking rule.
//
// Split from `CharGridSection` along the same seam as the model — `charGrid.ts` owns
// how many cells and how big, `charGridInk.ts` owns what is drawn in them — rather
// than at whatever line the budget happened to bite. The two halves read different
// places on the wire and answer different questions, so a reader looking for the
// ruling is not walking past the geometry to find it.

import type { Op } from '@shojiku/designer-core';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/context';
import { ColorSwatchPicker } from '../ui/ColorSwatchPicker';
import { FIELD_LABEL, PANEL_SWATCH_TRIGGER } from '../ui/chrome';
import { Select } from '../ui/Select';
import {
  type CharGridInkView,
  KINSOKU_MODES,
  type KinsokuMode,
  kinsokuOp,
  RUBY_SIZE_PRESETS,
  RULING_WIDTH_PRESETS,
  rubySizeOp,
  rulingColorOp,
  rulingWidthOp,
} from './charGridInk';
import { NumericComboField } from './NumericComboField';

/** A rule drawn at `pt`, so a width row shows what it does rather than only what it
 * is called. Clamped for DISPLAY so a legal but absurd width cannot push the row out
 * of the popover; the value committed is untouched. Never called for `0` — the
 * no-ruling row is the one value whose sample would be an empty box, so it carries a
 * NOTE instead and is filtered out of the sampled presets by its caller. */
/** A ruby preset rendered at its real size. The value is in POINTS and CSS wants
 * pixels: at 5–12px the sample is under-rendered by a third and too small to read,
 * which defeats the only reason the row carries one. Floored so the smallest preset
 * stays legible on a low-DPI screen. */
function rubyPx(pt: string): number {
  return Math.max(Number(pt) * (96 / 72), 9);
}

function rulePreview(pt: string): ReactNode {
  const drawn = Math.min(Math.max(Number(pt) * 2, 1), 8);
  return <span className="block w-full bg-current" style={{ height: `${drawn}px` }} />;
}

export function CharGridInkFields({
  ink,
  dispatch,
  path,
}: {
  readonly ink: CharGridInkView;
  readonly dispatch: (op: Op | null) => void;
  readonly path: string;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <NumericComboField
        label={t('panel.charGrid.rulingWidth')}
        value={ink.rulingWidth}
        // An unset width is the engine's 0.5pt, so the placeholder says so
        // rather than leaving the field blank and unexplained.
        placeholder="0.5"
        unit="pt"
        presets={[
          {
            value: '',
            label: '0.5',
            note: t('panel.charGrid.rulingDefault'),
            sample: rulePreview('0.5'),
          },
          { value: '0', note: t('panel.charGrid.rulingOff') },
          ...RULING_WIDTH_PRESETS.filter((preset) => preset !== '0').map((preset) => ({
            value: preset,
            note: preset === '2' ? t('panel.charGrid.rulingThick') : undefined,
            sample: rulePreview(preset),
          })),
        ]}
        hint={
          ink.widthFromStyle === null
            ? t('panel.charGrid.rulingOffHint')
            : t('panel.charGrid.rulingFromStyle', { name: ink.widthFromStyle })
        }
        onCommit={(raw) => dispatch(rulingWidthOp(path, raw))}
      />
      <div className="mb-2">
        <span className={FIELD_LABEL}>{t('panel.charGrid.rulingColor')}</span>
        <ColorSwatchPicker
          label={t('panel.charGrid.rulingColor')}
          value={ink.rulingColor}
          triggerClassName={PANEL_SWATCH_TRIGGER}
          customLabel={t('toolbar.color.custom')}
          clearLabel={t('toolbar.color.clear')}
          onCommit={(next) => dispatch(rulingColorOp(path, next))}
        />
      </div>
      <NumericComboField
        label={t('panel.charGrid.rubySize')}
        value={ink.rubySize}
        placeholder={t('panel.charGrid.rubySizeAuto')}
        unit="pt"
        presets={[
          {
            value: '',
            label: t('panel.charGrid.rubySizeAuto'),
            note: t('panel.charGrid.rulingDefault'),
          },
          ...RUBY_SIZE_PRESETS.map((preset) => ({
            value: preset,
            sample: (
              <span className="text-muted italic" style={{ fontSize: `${rubyPx(preset)}px` }}>
                {t('panel.charGrid.rubySample')}
              </span>
            ),
          })),
        ]}
        onCommit={(raw) => dispatch(rubySizeOp(path, raw))}
      />
      <div className="mb-2">
        <span className={FIELD_LABEL}>{t('panel.charGrid.kinsoku')}</span>
        <Select
          label={t('panel.charGrid.kinsoku')}
          value={ink.kinsoku}
          options={KINSOKU_MODES.map((mode) => ({
            value: mode,
            label: t(`panel.charGrid.kinsoku.${mode}`),
          }))}
          onChange={(next) => dispatch(kinsokuOp(path, next as KinsokuMode))}
        />
      </div>
    </div>
  );
}
