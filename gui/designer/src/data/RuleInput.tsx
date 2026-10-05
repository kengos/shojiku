// The commit-on-blur text input every value-rule control shares — a range bound,
// the placeholder, the example, a choice's value or printed text, and the display
// keys (a currency code or unit with suggestions, the decimal places).
//
// Uncontrolled and keyed by its committed value plus a reseed nonce bumped on
// every committing blur (`panel/useReseedKey`): an accepted entry that does not
// MOVE the value (`10.0` over `10`) and a refused one both put the document's
// value back on screen. A refusal says why in a line tied to the input by
// `aria-describedby`, and stays until the next commit. Enter commits (by
// blurring) unless an IME composition is still open.

import { useId, useState } from 'react';
import { useReseedKey } from '../panel/useReseedKey';
import { INPUT } from '../ui/chrome';

export interface RuleInputProps {
  /** The accessible name (the visible label, when there is one beside it). */
  readonly label: string;
  /** The committed value as text. */
  readonly value: string;
  readonly editable: boolean;
  readonly placeholder?: string;
  readonly className?: string;
  /** Commit the entry; the refusal MESSAGE when it was not taken. */
  readonly onCommit: (raw: string) => string | null;
  /** Marks the value as wrong for its field (a mistyped choice). */
  readonly invalid?: boolean;
  /** Extra classes for the refusal line (a narrow input lets it run wider). */
  readonly messageClassName?: string;
  /** The id of a `<datalist>` of suggestions (free entry stays possible). */
  readonly list?: string;
}

export function RuleInput({
  label,
  value,
  editable,
  placeholder,
  className,
  onCommit,
  invalid,
  messageClassName,
  list,
}: RuleInputProps) {
  const [key, reseed] = useReseedKey(value);
  const [refusal, setRefusal] = useState<string | null>(null);
  const messageId = useId();
  return (
    <>
      <input
        key={key}
        type="text"
        aria-label={label}
        aria-invalid={invalid === true || refusal !== null ? true : undefined}
        aria-describedby={refusal === null ? undefined : messageId}
        className={`${INPUT} ${className ?? ''}`}
        defaultValue={value}
        placeholder={placeholder}
        list={list}
        readOnly={!editable}
        onBlur={(event) => {
          if (!editable || event.currentTarget.value === value) {
            return;
          }
          setRefusal(onCommit(event.currentTarget.value));
          reseed();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.currentTarget.blur();
          }
        }}
      />
      {refusal === null ? null : (
        <p id={messageId} className={`m-0 text-sm text-error-text ${messageClassName ?? ''}`}>
          {refusal}
        </p>
      )}
    </>
  );
}
