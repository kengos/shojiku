// What a box does with content that does not fit: `textOverflow` for the text
// surfaces that honour it (the text shrinks, ends in "…", is cut, or runs past
// the box), `overflow` for a box that holds other items (a container, and the
// two sub-template frames through `FrameForm`) — hide what sticks out, or not.
// Both keys are not inherited, so each select shows the item's own value and
// the origin line only a named style can produce.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import type { CascadeContext } from '../toolbar/cascade';
import { effectiveValueIn } from '../toolbar/effective';
import { SelectField } from './choiceFields';
import { hasCapability } from './itemPanelProps';
import { applyPanelOp, plainTextOp } from './model';
import { type DefaultsSection, OriginBadge } from './OriginBadge';
import { styleOptionLabel } from './styleLabels';
import { withAuthored } from './TextLookFields';

/** The wire's `TextOverflow` minus `clip`, which an engine declares on its own
 * capability; and `Overflow` (`engine/core/src/style/enums.rs`). */
const TEXT_OVERFLOW_VALUES = ['visible', 'shrink', 'ellipsis'] as const;
const CLIP = 'clip';
const OVERFLOW_VALUES = ['visible', 'hidden'] as const;

export interface OverflowFieldProps {
  /** `textOverflow` for a text surface, `overflow` for a box of items. */
  readonly styleKey: 'textOverflow' | 'overflow';
  readonly path: string;
  readonly controller: EditorController;
  readonly ctx: CascadeContext;
  readonly capabilities?: readonly string[];
  readonly onNavigate?: (section: DefaultsSection) => void;
}

/** Whether the engine declares the key at all — the field is withheld
 * otherwise. */
export function overflowOffered(
  styleKey: OverflowFieldProps['styleKey'],
  capabilities: readonly string[] | undefined,
): boolean {
  return hasCapability(capabilities, `style.${styleKey}`);
}

export function OverflowField({
  styleKey,
  path,
  controller,
  ctx,
  capabilities,
  onNavigate,
}: OverflowFieldProps) {
  const { t } = useI18n();
  const effective = effectiveValueIn(ctx, styleKey);
  const base: readonly string[] =
    styleKey === 'overflow'
      ? OVERFLOW_VALUES
      : hasCapability(capabilities, 'style.textOverflow.clip')
        ? [...TEXT_OVERFLOW_VALUES, CLIP]
        : TEXT_OVERFLOW_VALUES;
  return (
    <div>
      <SelectField
        label={t(`panel.field.${styleKey}`)}
        value={effective.own}
        options={withAuthored(base, effective.own)}
        noneLabel={t('panel.field.formatNone')}
        optionLabel={(option) => styleOptionLabel(t, styleKey, option)}
        onCommit={(v) => applyPanelOp(controller, plainTextOp(path, ['style', styleKey], v))}
      />
      <OriginBadge effective={effective} onNavigate={onNavigate} />
    </div>
  );
}
