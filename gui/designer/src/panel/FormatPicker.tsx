// The format picker: the data binding's `data.format` editor, replacing
// the wire-spelling datalist. The free-text input keeps the expert path (commit
// on blur on a CHANGED value — a typo surfaces as a live engine diagnostic),
// and a popover offers the pickable formats with LOCALIZED labels, the wire
// spelling, and what the ENGINE renders for it; picking one commits ONE op.
// Picking is safe, typing is dangerous: picking is the primary path, typing stays
// possible for a registry name the picker does not enumerate. The samples come
// from the engine's format catalog — the GUI never formats, and the same
// catalog's `origin` is what lets `FormatOptionList` head each run of options
// with where its spellings come from.

import { useId } from 'react';
import { usePopover } from '../hooks/usePopover';
import { useI18n } from '../i18n/context';
import { INPUT, PICKER_POPOVER, PICKER_TOGGLE_FLUSH } from '../ui/chrome';
import { IconChevronDown } from '../ui/icons';
import { FormatOptionList } from './FormatOptionList';
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
            className={PICKER_TOGGLE_FLUSH}
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
          className={`${INPUT} w-full min-w-0 rounded-r-none`}
          defaultValue={value}
          // An empty box with no placeholder reads as "not loaded yet"; an
          // unset format is the type's own rendering.
          placeholder={t('panel.field.formatNone')}
          onBlur={(event) => {
            if (event.currentTarget.value !== value) {
              onCommit(event.currentTarget.value);
            }
          }}
        />
      </SideButtonField>
      {open ? (
        <div role="menu" className={PICKER_POPOVER}>
          <FormatOptionList
            options={options}
            onPick={(spelling) => {
              setOpen(false);
              if (spelling !== value) {
                onCommit(spelling);
              }
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
