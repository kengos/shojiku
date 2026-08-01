// Menu primitive over Headless UI's Menu — the library owns the hard parts
// (keyboard navigation, ARIA menu pattern, outside-click, Escape, anchored
// portal); the LOOK is plain Tailwind utilities over the `--sj-*` tokens.
// Data-driven: grouped entries with optional headings (the insert-menu shape);
// picking an entry closes the menu and hands the entry id up. Labels render as
// React text (auto-escaped).
//
// Two trigger forms: the default text + chevron button, and — when `trigger`
// is given — a compact icon button (the header's theme / language controls),
// with `label` as its accessible name. `checkedId` marks the current choice in
// a single-choice menu (a checkmark on the matching entry).

import {
  Menu as HeadlessMenu,
  MenuButton,
  MenuHeading,
  MenuItem,
  MenuItems,
  MenuSection,
} from '@headlessui/react';
import type { ReactNode } from 'react';
import { IconCheck, IconChevronDown } from './icons';
import { TipBubble } from './TipBubble';

export interface MenuEntry {
  /** Handed to `onSelect` when picked. */
  readonly id: string;
  /** The displayed label (the caller's i18n string). */
  readonly label: string;
  readonly disabled?: boolean;
}

export interface MenuGroup {
  /** Optional group heading (the caller's i18n string). */
  readonly heading?: string;
  readonly entries: readonly MenuEntry[];
}

export interface MenuProps {
  /** The trigger's visible label (text form) OR accessible name (icon form). */
  readonly label: string;
  readonly groups: readonly MenuGroup[];
  readonly onSelect: (id: string) => void;
  /** Icon content for a compact icon trigger; omit for the text + chevron
   * form. When present, `label` becomes the button's accessible name. */
  readonly trigger?: ReactNode;
  /** The current choice in a single-choice menu — the matching entry shows a
   * checkmark. Omit for an action menu (no entry is "current"). */
  readonly checkedId?: string;
}

const TEXT_TRIGGER =
  'inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-text transition-colors hover:border-muted data-open:border-muted';
const ICON_TRIGGER =
  'inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-md border border-border bg-surface p-2 text-text transition-colors hover:border-muted data-open:border-muted';

export function Menu({ label, groups, onSelect, trigger, checkedId }: MenuProps) {
  return (
    <HeadlessMenu>
      {trigger !== undefined ? (
        // The icon trigger has no visible text, so `label` is both its
        // accessible name and its tooltip — the instant bubble, never native
        // `title`. The text trigger already shows its label and gets none.
        <span className="group/tip relative inline-flex">
          <MenuButton className={ICON_TRIGGER} aria-label={label}>
            {trigger}
          </MenuButton>
          <TipBubble text={label} />
        </span>
      ) : (
        <MenuButton className={TEXT_TRIGGER}>
          {label}
          <IconChevronDown className="shrink-0 text-muted" />
        </MenuButton>
      )}
      <MenuItems
        transition
        anchor={{ to: 'bottom start', gap: 4 }}
        className="z-50 min-w-40 rounded-md border border-border bg-surface py-1 text-text shadow-lg transition duration-100 focus:outline-none data-closed:opacity-0"
      >
        {groups.map((group, index) => (
          <MenuSection key={group.heading ?? index} className="py-1">
            {group.heading === undefined ? null : (
              <MenuHeading className="px-3 py-1 text-sm text-muted">{group.heading}</MenuHeading>
            )}
            {group.entries.map((entry) => (
              <MenuItem key={entry.id} disabled={entry.disabled}>
                {/* aria-current (valid on menuitem) carries the current choice
                    to assistive tech — the checkmark icon is aria-hidden. */}
                <button
                  type="button"
                  aria-current={entry.id === checkedId ? 'true' : undefined}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-3 py-2 text-left text-text data-disabled:cursor-default data-disabled:opacity-45 data-focus:bg-chrome"
                  onClick={() => onSelect(entry.id)}
                >
                  <span>{entry.label}</span>
                  {entry.id === checkedId ? <IconCheck className="shrink-0 text-accent" /> : null}
                </button>
              </MenuItem>
            ))}
          </MenuSection>
        ))}
      </MenuItems>
    </HeadlessMenu>
  );
}
