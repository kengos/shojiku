// A contextual-help affordance: a small `?` beside a genuinely confusing
// control. Click opens a short popover (an optional bold title + a ≤2-sentence
// body in the user's language + an optional "learn more" that jumps to the
// glossary). Headless UI `Popover` owns the hard parts (focus, Escape,
// outside-click, the ARIA disclosure pattern, the anchored portal); the LOOK is
// plain Tailwind over the `--sj-*` tokens. Pure presentational: every string is
// resolved by the caller and rendered as React TEXT (auto-escaped) — never
// markup, so a future help topic can carry no injection surface.

import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { IconHelp } from '../ui/icons';
import { TipBubble } from '../ui/TipBubble';

export interface HelpHintProps {
  /** Accessible name for the `?` trigger (an icon-only button). */
  readonly label: string;
  /** Optional bold lead line. */
  readonly title?: string;
  /** The explanation (≤2 sentences). */
  readonly body: string;
  /** Optional "learn more" action (opens the glossary). Absent → no link. */
  readonly onMore?: () => void;
  /** Label for the "learn more" link (shown only with `onMore`). */
  readonly moreLabel?: string;
}

export function HelpHint({ label, title, body, onMore, moreLabel }: HelpHintProps) {
  return (
    // The Popover root is already the positioned inline box the bubble needs,
    // so it only gains `group/tip` — the `?` is icon-only, and its tooltip is
    // the instant bubble rather than native `title`.
    <Popover className="group/tip relative inline-flex">
      <PopoverButton
        aria-label={label}
        className="inline-flex cursor-pointer items-center rounded-full border-0 bg-transparent p-0.5 text-muted hover:text-text focus:outline-none data-open:text-text"
      >
        <IconHelp size={14} />
      </PopoverButton>
      <TipBubble text={label} />
      <PopoverPanel
        anchor={{ to: 'bottom start', gap: 4 }}
        className="z-50 w-64 rounded-md border border-border bg-surface p-3 text-left text-sm text-text shadow-lg focus:outline-none"
      >
        {title === undefined ? null : <p className="m-0 mb-1 font-semibold">{title}</p>}
        <p className="m-0 whitespace-pre-line text-muted">{body}</p>
        {onMore === undefined ? null : (
          <button
            type="button"
            className="mt-2 cursor-pointer border-0 bg-transparent p-0 text-accent underline"
            onClick={onMore}
          >
            {moreLabel}
          </button>
        )}
      </PopoverPanel>
    </Popover>
  );
}
