// Switch primitive over Headless UI's Switch — the library owns the behavior
// (role="switch", aria-checked, Space/Enter toggling); the LOOK is a plain
// utility-styled track + knob over the `--sj-*` tokens, moved by the
// `data-checked` variant. Controlled (`checked` / `onChange`).

import { Switch as HeadlessSwitch } from '@headlessui/react';

export interface SwitchProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** Accessible name (the caller's i18n string). */
  readonly label: string;
  readonly disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <HeadlessSwitch
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      aria-label={label}
      className="group inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-border bg-chrome p-0.5 transition-colors data-checked:border-accent data-checked:bg-accent disabled:cursor-default disabled:opacity-45"
    >
      <span className="size-4.5 rounded-full bg-surface shadow-sm transition-transform group-data-checked:translate-x-5" />
    </HeadlessSwitch>
  );
}
