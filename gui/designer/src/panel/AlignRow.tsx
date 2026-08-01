// The alignment cluster of the child-layout section: one icon button per engine
// cross-axis alignment value, the effective one pressed. Chrome vocabulary is
// the nontech-pm's (an everyday word for alignment, not align-items); a re-pick of the active value
// authors nothing (minimal wire).

import type { ComponentType } from 'react';
import { useI18n } from '../i18n/context';
import { FIELD_LABEL } from '../ui/chrome';
import {
  IconAlignBottom,
  IconAlignMiddle,
  IconAlignStretch,
  IconAlignTop,
  type IconProps,
} from '../ui/icons';
import { TipBubble } from '../ui/TipBubble';
import { ALIGN_VALUES, type AlignValue } from './layoutOps';

const ALIGN_ICONS: Readonly<Record<AlignValue, ComponentType<IconProps>>> = {
  start: IconAlignTop,
  center: IconAlignMiddle,
  end: IconAlignBottom,
  stretch: IconAlignStretch,
};

/** One icon button in the alignment row. */
function AlignButton({
  value,
  active,
  onPick,
}: {
  readonly value: AlignValue;
  readonly active: boolean;
  readonly onPick: () => void;
}) {
  const { t } = useI18n();
  const Icon = ALIGN_ICONS[value];
  return (
    <button
      type="button"
      aria-label={t(`panel.layout.align.${value}`)}
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
      <TipBubble text={t(`panel.layout.align.${value}`)} />
    </button>
  );
}

export function AlignRow({
  alignItems,
  onPick,
}: {
  /** The EFFECTIVE alignment — a garbage authored value simply reads as no
   * active button (the engine is the validator). */
  readonly alignItems: string;
  readonly onPick: (value: AlignValue) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-2">
      <span className={FIELD_LABEL}>{t('panel.layout.align')}</span>
      {/* biome-ignore lint/a11y/useSemanticElements: a toolbar-style button cluster — fieldset groups form fields, not buttons (the align-group precedent). */}
      <div role="group" aria-label={t('panel.layout.align')} className="flex gap-1">
        {ALIGN_VALUES.map((value) => (
          <AlignButton
            key={value}
            value={value}
            active={alignItems === value}
            onPick={() => onPick(value)}
          />
        ))}
      </div>
    </div>
  );
}
