// The labeled colour swatch row the band and rule editors compose. (The value
// control a picked field earns is `ValueControl`.)

import { useId } from 'react';
import { useI18n } from '../i18n/context';
import { ColorSwatchPicker } from '../ui/ColorSwatchPicker';
import { FIELD_LABEL, PANEL_SWATCH_TRIGGER } from '../ui/chrome';
import { TipBubble } from '../ui/TipBubble';

export function SwatchRow({
  label,
  value,
  hint,
  onCommit,
}: {
  readonly label: string;
  readonly value: string;
  /** Where a CASCADED value comes from, as the gdoc-style hover bubble. Used
   * where the origin is the engine floor and a badge line would be noise. The
   * control keeps its own accessible name and DESCRIBES itself with the
   * bubble, so the origin reaches a keyboard user without being re-read on
   * every visit. */
  readonly hint?: string;
  readonly onCommit: (value: string) => void;
}) {
  const { t } = useI18n();
  const hintId = useId();
  // The hover group is the whole ROW, not the label: the origin explains the
  // CONTROL, so pointing at the swatch has to be enough to see it. The bubble
  // still hangs off the label span (the only `relative` box here), which is
  // where it has always been drawn.
  return (
    <div className="group/tip flex items-center gap-2">
      <span className={`${FIELD_LABEL} relative mb-0 flex-1`}>
        {label}
        {hint === undefined ? null : <TipBubble text={hint} id={hintId} />}
      </span>
      <ColorSwatchPicker
        label={label}
        describedBy={hint === undefined ? undefined : hintId}
        value={value}
        onCommit={onCommit}
        triggerClassName={PANEL_SWATCH_TRIGGER}
        customLabel={t('toolbar.color.custom')}
        clearLabel={t('toolbar.color.clear')}
      />
    </div>
  );
}
