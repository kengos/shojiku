// The two decoration-line checkboxes, like a word processor's U and S, over
// one `Decoration`: each box shows its line, and a click reports which line was
// toggled. Value in, value out: the decoration tab (cascade-bound) and the
// catalog section's `TextDecoration` composite both draw through it.

import { useI18n } from '../i18n/context';
import { type Decoration, hasLineThrough, hasUnderline } from '../text/spanRuns';

export type DecorationLine = 'underline' | 'line_through';

export function DecorationBoxes({
  current,
  onToggle,
}: {
  readonly current: Decoration;
  readonly onToggle: (line: DecorationLine) => void;
}) {
  const { t } = useI18n();
  const box = (line: DecorationLine, label: string, checked: boolean) => (
    <label className="flex items-center gap-1.5 text-sm text-text">
      <input
        type="checkbox"
        className="accent-accent"
        checked={checked}
        onChange={() => onToggle(line)}
      />
      {label}
    </label>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {box('underline', t('flow.underline'), hasUnderline(current))}
      {box('line_through', t('flow.lineThrough'), hasLineThrough(current))}
    </div>
  );
}
