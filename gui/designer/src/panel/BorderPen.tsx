// The "pen" row: the width / colour / line-style an edge click or a preset
// applies. Editor-local state only — nothing here writes the document — plus
// the two capability gates that decide which line styles may be OFFERED, since
// an older engine parse-rejects `dashed`/`dotted` outright.

import type { Dispatch, SetStateAction } from 'react';
import { useI18n } from '../i18n/context';
import { ColorSwatchPicker } from '../ui/ColorSwatchPicker';
import { FIELD_LABEL } from '../ui/chrome';
import {
  BORDER_STYLE_VALUES,
  type BorderStyleValue,
  PATTERNED_BORDER_STYLES,
  type Pen,
} from './borderTypes';
import { hasCapability } from './itemPanelProps';
import { StepperField } from './StepperField';

export interface BorderPenProps {
  readonly pen: Pen;
  readonly setPen: Dispatch<SetStateAction<Pen>>;
  readonly capabilities?: readonly string[];
}

export function BorderPen({ pen, setPen, capabilities }: BorderPenProps) {
  const { t } = useI18n();
  const styleControl = hasCapability(capabilities, 'style.borderStyle');
  // An older engine parse-rejects `dashed`/`dotted`, so the picker offers
  // them only when the engine says it understands them.
  const patterned = hasCapability(capabilities, 'style.borderStyle.dashed_dotted');
  const styleChoices = BORDER_STYLE_VALUES.filter(
    (v) => patterned || !PATTERNED_BORDER_STYLES.includes(v),
  );

  const stepWidth = (dir: 1 | -1) =>
    setPen((p) => ({
      ...p,
      width: Math.min(1000, Math.max(0.5, Math.round((p.width + dir * 0.5) * 10) / 10)),
    }));
  const commitWidth = (raw: string) => {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      setPen((p) => ({ ...p, width: Math.min(1000, Math.max(0.5, n)) }));
    }
  };

  return (
    // `items-start`, not `items-end`: `StepperField`'s root carries its own
    // `mb-2`, so bottom-aligning floated the width column 8px above the other
    // two and the three labels landed on different baselines. Tops align, and
    // all three labels go through the SAME `FIELD_LABEL` — the two here used to
    // be hand-rolled spans with `gap-0.5`, which is the other half of the drift.
    <div className="flex flex-wrap items-start gap-2">
      {/* Wide enough for the value AND the `pt` badge the input reserves 44px
        for; at `w-24` the editable text area was ~26px and read as broken. */}
      <div className="w-28">
        <StepperField
          label={t('border.penWidth')}
          value={String(pen.width)}
          unit="pt"
          canStep
          onCommit={commitWidth}
          onStep={stepWidth}
        />
      </div>
      <div>
        <span className={FIELD_LABEL}>{t('border.penColor')}</span>
        <ColorSwatchPicker
          label={t('border.penColor')}
          value={pen.color}
          onCommit={(v) => setPen((p) => ({ ...p, color: v }))}
          triggerClassName="inline-flex h-8 w-10 cursor-pointer items-center justify-center rounded-md border border-border bg-surface hover:border-muted"
          customLabel={t('toolbar.color.custom')}
          clearLabel={t('toolbar.color.clear')}
        />
      </div>
      {styleControl ? (
        // `min-w-0 flex-1`: the select takes the rest of the row and SHRINKS
        // rather than overflowing the ~255px panel.
        <label className="block min-w-0 flex-1">
          <span className={FIELD_LABEL}>{t('border.penStyle')}</span>
          <select
            className="h-8 w-full min-w-0 rounded-md border border-border bg-surface px-1 text-sm text-text"
            value={pen.style}
            onChange={(event) => {
              // Capture synchronously — `currentTarget` is null inside the
              // deferred functional-update callback.
              const next = event.currentTarget.value as BorderStyleValue;
              setPen((p) => ({ ...p, style: next }));
            }}
          >
            {styleChoices.map((value) => (
              <option key={value} value={value}>
                {t(`border.style.${value}`)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
