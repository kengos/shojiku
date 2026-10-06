// The alignment cluster of the child-layout section: one icon button per engine
// cross-axis alignment value the CURRENT arrangement honours, the effective one
// pressed. The cross axis decides the words and the glyphs: a row and a grid align
// their children vertically (top / middle / bottom), a stack horizontally (left /
// center / right). `baseline` is offered only in a row, and only where the engine
// accepts it — a stack and a grid fall back to `start` for it. Chrome vocabulary
// is the nontech-pm's (an everyday word for alignment, not align-items); a re-pick
// of the active value authors nothing (minimal wire).

import type { ComponentType } from 'react';
import { useI18n } from '../i18n/context';
import { FIELD_LABEL } from '../ui/chrome';
import {
  IconAlignBaseline,
  IconAlignBottom,
  IconAlignCenterEdge,
  IconAlignLeftEdge,
  IconAlignMiddle,
  IconAlignRightEdge,
  IconAlignStretch,
  IconAlignStretchH,
  IconAlignTop,
  type IconProps,
} from '../ui/icons';
import { TipBubble } from '../ui/TipBubble';
import type { LayoutMode } from './layoutModel';
import type { AlignValue } from './layoutOps';

interface AlignChoice {
  readonly value: AlignValue;
  /** The catalog key of the button's name (also its tooltip). */
  readonly label: string;
  readonly Icon: ComponentType<IconProps>;
}

/** Vertical alignment — a row's and a grid's cross axis. */
const VERTICAL: readonly AlignChoice[] = [
  { value: 'start', label: 'panel.layout.align.start', Icon: IconAlignTop },
  { value: 'center', label: 'panel.layout.align.center', Icon: IconAlignMiddle },
  { value: 'end', label: 'panel.layout.align.end', Icon: IconAlignBottom },
  { value: 'stretch', label: 'panel.layout.align.stretch', Icon: IconAlignStretch },
];

/** Horizontal alignment — a stack's cross axis. */
const HORIZONTAL: readonly AlignChoice[] = [
  { value: 'start', label: 'panel.layout.align.h.start', Icon: IconAlignLeftEdge },
  { value: 'center', label: 'panel.layout.align.h.center', Icon: IconAlignCenterEdge },
  { value: 'end', label: 'panel.layout.align.h.end', Icon: IconAlignRightEdge },
  { value: 'stretch', label: 'panel.layout.align.h.stretch', Icon: IconAlignStretchH },
];

const BASELINE: AlignChoice = {
  value: 'baseline',
  label: 'panel.layout.align.baseline',
  Icon: IconAlignBaseline,
};

/** The engine capability that admits `alignItems: baseline` (older engines
 * parse-reject the value). */
export const BASELINE_CAPABILITY = 'box.alignItems.baseline';

/** The buttons an arrangement offers, in order. */
export function alignChoices(mode: LayoutMode, baseline: boolean): readonly AlignChoice[] {
  if (mode === 'column') {
    return HORIZONTAL;
  }
  return mode === 'row' && baseline ? [...VERTICAL, BASELINE] : VERTICAL;
}

/** One icon button in the alignment row. */
function AlignButton({
  choice,
  active,
  onPick,
}: {
  readonly choice: AlignChoice;
  readonly active: boolean;
  readonly onPick: () => void;
}) {
  const { t } = useI18n();
  const { Icon } = choice;
  return (
    <button
      type="button"
      aria-label={t(choice.label)}
      aria-pressed={active}
      className={`group/tip relative cursor-pointer rounded-md border px-1.5 py-1 leading-none ${
        active ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface text-muted'
      }`}
      onClick={() => {
        // A re-pick of the active alignment authors nothing (minimal wire).
        if (!active) {
          onPick();
        }
      }}
    >
      <Icon size={15} />
      <TipBubble text={t(choice.label)} />
    </button>
  );
}

export function AlignRow({
  mode,
  alignItems,
  baseline,
  onPick,
}: {
  readonly mode: LayoutMode;
  /** The EFFECTIVE alignment — a garbage authored value simply reads as no
   * active button (the engine is the validator). */
  readonly alignItems: string;
  /** The engine accepts `baseline` (`BASELINE_CAPABILITY`). */
  readonly baseline: boolean;
  readonly onPick: (value: AlignValue) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-2">
      <span className={FIELD_LABEL}>{t('panel.layout.align')}</span>
      {/* biome-ignore lint/a11y/useSemanticElements: a toolbar-style button cluster — fieldset groups form fields, not buttons (the align-group precedent). */}
      <div role="group" aria-label={t('panel.layout.align')} className="flex gap-1">
        {alignChoices(mode, baseline).map((choice) => (
          <AlignButton
            key={choice.value}
            choice={choice}
            active={alignItems === choice.value}
            onPick={() => onPick(choice.value)}
          />
        ))}
      </div>
    </div>
  );
}
