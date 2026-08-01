// The format toolbar's colour control — text colour for a text item, fill for
// any other boxed one. The popover itself is the shared `ui/ColorSwatchPicker`;
// only the op stays here (minimal wire over the cascade), so the picker carries
// no wire knowledge.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { applyPanelOp } from '../panel/model';
import { ColorSwatchPicker } from '../ui/ColorSwatchPicker';
import type { EffectiveValue } from './effective';
import { FMT_BTN, hintTitle, originHint } from './fmtChrome';
import { type ColorKey, colorOp } from './model';

/** The color control: the shared swatch/native picker on the toolbar rail. The
 * op stays here (minimal-wire over the cascade) so the picker carries no wire
 * knowledge. */
export function ColorControl({
  label,
  eff,
  colorKey,
  path,
  controller,
}: {
  readonly label: string;
  readonly eff: EffectiveValue;
  readonly colorKey: ColorKey;
  readonly path: string;
  readonly controller: EditorController;
}) {
  const { t } = useI18n();
  return (
    <ColorSwatchPicker
      label={label}
      value={eff.value}
      onCommit={(next) => applyPanelOp(controller, colorOp(path, colorKey, eff, next))}
      triggerClassName={FMT_BTN}
      tip={hintTitle(label, originHint(t, eff))}
      customLabel={t('toolbar.color.custom')}
      clearLabel={t('toolbar.color.clear')}
    />
  );
}
