// The decoration tab's colour FIELD: the labeled swatch the fill/text-colour
// cluster renders (the typography rows are `TypographyFields`).
// `StyleSection.tsx` beside this file composes them with the border editor, the
// line stroke editor and the row-condition rules.
//
// Every field carries an `OriginBadge` — the cascade-effective value plus where
// it came from — so an unset control still says what the item renders at.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import type { cascadeContext } from '../toolbar/cascade';
import { effectiveValueIn } from '../toolbar/effective';
import { ColorSwatchPicker } from '../ui/ColorSwatchPicker';
import { FIELD_LABEL, PANEL_SWATCH_TRIGGER } from '../ui/chrome';
import { SwatchValueLabel } from '../ui/SwatchValueLabel';
import { plainTextOp } from './model';
import { type DefaultsSection, OriginBadge } from './OriginBadge';

/** One panel color row (text glyph color or box fill): a labeled swatch picker
 * over the cascade-effective color, with an origin badge. No hand-typed hex. */
export function PanelColorField({
  label,
  styleKey,
  ctx,
  path,
  controller,
  onNavigate,
}: {
  readonly label: string;
  readonly styleKey: string;
  readonly ctx: ReturnType<typeof cascadeContext>;
  readonly path: string;
  readonly controller: EditorController;
  readonly onNavigate?: (section: DefaultsSection) => void;
}) {
  const { t } = useI18n();
  const effective = effectiveValueIn(ctx, styleKey);
  return (
    <div className="mb-2">
      <span className={FIELD_LABEL}>{label}</span>
      {/* The chip and the words for it, on one row. A closed picker's chip is
          the whole state of the field, so a reader who cannot tell two swatches
          apart had to open the palette to learn what is set — every time. This
          is the field colour and the fill, the two a reader touches most. */}
      <div className="flex min-w-0 items-center gap-1.5">
        <ColorSwatchPicker
          label={label}
          value={effective.value}
          onCommit={(v) => controller.apply(plainTextOp(path, ['style', styleKey], v))}
          triggerClassName={PANEL_SWATCH_TRIGGER}
          customLabel={t('toolbar.color.custom')}
          clearLabel={t('toolbar.color.clear')}
        />
        <SwatchValueLabel value={effective.value} />
      </div>
      <OriginBadge effective={effective} onNavigate={onNavigate} />
    </div>
  );
}
