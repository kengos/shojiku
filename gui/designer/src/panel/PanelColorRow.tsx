// A labeled panel colour row: the swatch picker and the words for its chip on
// one row. A closed picker's chip is the whole state of the field, so a reader
// who cannot tell two swatches apart would otherwise have to open the palette
// to learn what is set. Value in, value out: the decoration tab's cascade field
// and the catalog section's colour widget both draw through it.

import type { ReactNode } from 'react';
import { useI18n } from '../i18n/context';
import { ColorSwatchPicker } from '../ui/ColorSwatchPicker';
import { FIELD_LABEL, PANEL_SWATCH_TRIGGER } from '../ui/chrome';
import { SwatchValueLabel } from '../ui/SwatchValueLabel';

export function PanelColorRow({
  label,
  value,
  onCommit,
  children,
}: {
  readonly label: string;
  readonly value: string;
  readonly onCommit: (value: string) => void;
  /** Drawn under the row (the decoration tab's origin badge). */
  readonly children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-2">
      <span className={FIELD_LABEL}>{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <ColorSwatchPicker
          label={label}
          value={value}
          onCommit={onCommit}
          triggerClassName={PANEL_SWATCH_TRIGGER}
          customLabel={t('toolbar.color.custom')}
          clearLabel={t('toolbar.color.clear')}
        />
        <SwatchValueLabel value={value} />
      </div>
      {children}
    </div>
  );
}
