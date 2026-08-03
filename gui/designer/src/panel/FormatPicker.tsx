// The format picker: the data binding's `data.format` editor, replacing
// the wire-spelling datalist. The free-text input keeps the expert path (commit
// on blur on a CHANGED value — a typo surfaces as a live engine diagnostic),
// and a popover offers the pickable formats with LOCALIZED labels, the wire
// spelling, and an illustrative sample rendering; picking one commits ONE op.
// Picking is safe, typing is dangerous: picking is the primary path, typing stays
// possible for a registry name the picker does not enumerate. The samples are
// illustrative (the engine is the live validator/renderer, not the GUI).

import { useId } from 'react';
import { usePopover } from '../hooks/usePopover';
import { useI18n } from '../i18n/context';
import { PICKER_POPOVER, PICKER_ROW, PICKER_TOGGLE } from '../ui/chrome';
import { IconChevronDown } from '../ui/icons';
import { SideButtonField } from './fields';
import type { FormatOption } from './formatModel';

export interface FormatPickerProps {
  readonly label: string;
  /** The current `data.format` value. */
  readonly value: string;
  readonly options: readonly FormatOption[];
  /** Commit a format (a picked option's spelling, or free-typed text). */
  readonly onCommit: (spelling: string) => void;
}

export function FormatPicker({ label, value, options, onCommit }: FormatPickerProps) {
  const { t } = useI18n();
  const { open, setOpen, rootRef } = usePopover();
  const id = useId();
  return (
    <div className="relative" ref={rootRef}>
      <SideButtonField
        label={label}
        htmlFor={id}
        button={
          <button
            type="button"
            className={PICKER_TOGGLE}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={t('format.open')}
            onClick={() => setOpen((v) => !v)}
          >
            <IconChevronDown size={12} className="text-muted" />
          </button>
        }
      >
        <input
          key={value}
          id={id}
          type="text"
          className="w-full"
          defaultValue={value}
          onBlur={(event) => {
            if (event.currentTarget.value !== value) {
              onCommit(event.currentTarget.value);
            }
          }}
        />
      </SideButtonField>
      {open ? (
        <div role="menu" className={PICKER_POPOVER}>
          {options.length === 0 ? (
            <p className="m-0 px-2 py-1 text-sm text-muted">{t('format.empty')}</p>
          ) : (
            options.map((option) => (
              <button
                key={option.spelling}
                type="button"
                role="menuitem"
                className={PICKER_ROW}
                onClick={() => {
                  setOpen(false);
                  if (option.spelling !== value) {
                    onCommit(option.spelling);
                  }
                }}
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-semibold">
                    {option.labelKey !== undefined ? t(option.labelKey) : option.spelling}
                  </span>
                  <code className="text-sm text-muted">{option.spelling}</code>
                </span>
                {option.sample !== '' ? (
                  <span className="text-sm text-muted italic [overflow-wrap:anywhere]">
                    {option.sample}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
