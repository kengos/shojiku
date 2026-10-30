// The panel's closed-by-default disclosure button: a chevron and a title,
// `aria-expanded` / `aria-controls` naming the body the caller renders. The
// open state belongs to the caller (component state, never written to the
// template); this is only the button, so every disclosure looks the same.

import { IconChevronDown } from '../ui/icons';

export function DisclosureToggle({
  open,
  bodyId,
  title,
  onToggle,
}: {
  readonly open: boolean;
  /** The id of the body element the button opens. */
  readonly bodyId: string;
  readonly title: string;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      // No preflight is imported, so a bare button keeps the browser's grey
      // face and outset border — which in dark chrome puts light text on a
      // light box. The reset is part of the control.
      className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-sm text-text"
      aria-expanded={open}
      aria-controls={bodyId}
      onClick={onToggle}
    >
      {/* The section heading's chevron idiom: one glyph, a quarter turn when closed. */}
      <IconChevronDown
        size={12}
        data-collapsed={open ? undefined : ''}
        className="text-muted transition-transform data-collapsed:-rotate-90"
      />
      {title}
    </button>
  );
}
