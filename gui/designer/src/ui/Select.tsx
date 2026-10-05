// Select primitive over Headless UI's Listbox — the library owns the hard
// parts (keyboard navigation, typeahead, ARIA listbox pattern, outside-click,
// anchored portal); the LOOK is plain Tailwind utilities over the `--sj-*`
// tokens (portaled options resolve them because the app applies tokens on the
// document root). Options carry a display `label` separate from the wire
// `value` — the base for localized-label pickers. Controlled (`value` /
// `onChange`); a "none" choice is just an option the caller includes
// (`{ value: '', label: noneLabel }`). Labels render as React text
// (auto-escaped); an unknown value displays verbatim, never as HTML.

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import type { ReactNode } from 'react';
import { IconChevronDown } from './icons';

export interface SelectOption {
  /** The committed wire value. */
  readonly value: string;
  /** The displayed label (the caller's i18n/localized string). */
  readonly label: string;
  /** Decorative leading glyph (caller code, never document content) shown in
   * the option and, for the picked option, in the button. The accessible name
   * stays the label text. Omit for a text-only option. */
  readonly icon?: ReactNode;
}

export interface SelectProps {
  /** The current wire value. Unknown values display verbatim. */
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly onChange: (value: string) => void;
  /** Accessible name for the trigger (the caller's i18n string). */
  readonly label: string;
  readonly disabled?: boolean;
}

export function Select({ value, options, onChange, label, disabled }: SelectProps) {
  const selected = options.find((option) => option.value === value);
  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <ListboxButton
        aria-label={label}
        className="inline-flex w-full min-w-32 cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-left text-text transition-colors hover:border-muted disabled:cursor-default disabled:opacity-45"
      >
        {selected?.icon === undefined ? (
          <span className="truncate">{selected === undefined ? value : selected.label}</span>
        ) : (
          // Only an option that carries a glyph gets the row around it, so a
          // text-only picker keeps its markup exactly.
          <span className="flex min-w-0 items-center gap-2">
            {selected.icon}
            <span className="truncate">{selected.label}</span>
          </span>
        )}
        <IconChevronDown className="shrink-0 text-muted" />
      </ListboxButton>
      <ListboxOptions
        transition
        anchor={{ to: 'bottom start', gap: 4 }}
        className="z-50 max-h-64 w-(--button-width) overflow-y-auto rounded-md border border-border bg-surface py-1 text-text shadow-lg transition duration-100 focus:outline-none data-closed:opacity-0"
      >
        {options.map((option) => (
          <ListboxOption
            key={option.value}
            value={option.value}
            className={`${option.icon === undefined ? '' : 'flex items-center gap-2 '}cursor-pointer px-3 py-2 data-focus:bg-chrome data-selected:font-semibold`}
          >
            {option.icon}
            {option.label}
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
}
