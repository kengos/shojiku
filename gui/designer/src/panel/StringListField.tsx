// A free-text LIST field: one input per entry plus a trailing blank row that
// appends when you type in it. There is no "add" button — a button would have
// to author an empty entry first, which the engine drops, so the blank row IS
// the add affordance (and it keeps the whole widget stateless: the document is
// the only state, re-read every render).
//
// Each input is UNCONTROLLED and keyed by its own value, like every other
// commit-on-blur field in the panel: it reseeds on undo/selection change and
// survives a sibling row's commit. Enter blurs (one commit path) and is guarded
// against an IME composition, so confirming a Japanese conversion does not
// commit a half-typed entry.

import { useId } from 'react';
import { IconButton } from '../ui/Button';
import { FIELD_LABEL, INPUT } from '../ui/chrome';
import { IconTrash } from '../ui/icons';

export interface StringListFieldProps {
  readonly label: string;
  readonly entries: readonly string[];
  /** Tooltip for a row's remove button (already localized). */
  readonly removeLabel: string;
  /** Shown in the trailing blank row. */
  readonly addPlaceholder: string;
  /** Entries the engine accepts; the blank row disappears at the cap. */
  readonly max: number;
  readonly onCommit: (index: number, value: string) => void;
  readonly onRemove: (index: number) => void;
}

export function StringListField({
  label,
  entries,
  removeLabel,
  addPlaceholder,
  max,
  onCommit,
  onRemove,
}: StringListFieldProps) {
  const id = useId();
  // The trailing blank row is a row like any other, at index `entries.length`.
  const rows = entries.length >= max ? entries : [...entries, ''];
  return (
    <span className="mb-2 block">
      <span className={FIELD_LABEL} id={`${id}-label`}>
        {label}
      </span>
      {rows.map((entry, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: entries are an order-preserving list of plain strings with no identity of their own; the input inside is keyed by its value.
          key={`${id}-row-${index}`}
          className="mb-1 flex min-w-0 items-stretch gap-1"
        >
          <input
            key={entry}
            type="text"
            aria-labelledby={`${id}-label`}
            className={`${INPUT} min-w-0 flex-1`}
            defaultValue={entry}
            placeholder={index === entries.length ? addPlaceholder : undefined}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.currentTarget.blur();
              }
            }}
            onBlur={(event) => {
              if (event.currentTarget.value !== entry) {
                onCommit(index, event.currentTarget.value);
              }
            }}
          />
          {index === entries.length ? null : (
            <IconButton label={removeLabel} variant="ghost" onClick={() => onRemove(index)}>
              <IconTrash />
            </IconButton>
          )}
        </span>
      ))}
    </span>
  );
}
