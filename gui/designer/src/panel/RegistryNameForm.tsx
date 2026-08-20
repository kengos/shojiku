// The inline rename form a registry row opens: a single controlled field
// committing on submit (Enter or the button), with a cancel. Shared by the
// `styles:` and `formats:` rows, which rename identically — the operation
// differs in what it rewrites, not in how the name is taken.
//
// Controlled, so keystrokes are held without re-serializing the document; the
// instance unmounts when its row closes, so it reseeds on the next open.
//
// Enter is IME-guarded. A Japanese author presses Enter to CONFIRM a kanji
// conversion, and a single-input form submits on Enter — so without the guard
// the rename commits the half-converted reading and rewrites every reference
// to it. jsdom defaults `isComposing` to false, so only an explicit
// `isComposing: true` keydown test catches this.
//
// Stacked rather than one flex row: a `w-full` input beside the buttons
// squeezed the submit label into a mid-word wrap at the widths the
// document-settings section rail leaves.

import { type FormEvent, useState } from 'react';
import { BTN_SM, INPUT } from '../ui/chrome';

export interface RegistryNameFormProps {
  readonly initial: string;
  readonly submitLabel: string;
  readonly cancelLabel: string;
  readonly placeholder: string;
  readonly onSubmit: (value: string) => void;
  readonly onCancel: () => void;
}

export function RegistryNameForm({
  initial,
  submitLabel,
  cancelLabel,
  placeholder,
  onSubmit,
  onCancel,
}: RegistryNameFormProps) {
  const [value, setValue] = useState(initial);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(value);
  };
  return (
    <form className="mt-1 flex flex-col gap-1" onSubmit={submit}>
      <input
        type="text"
        className={INPUT}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing && event.key === 'Enter') {
            event.preventDefault();
          }
        }}
      />
      <div className="flex items-center gap-1">
        <button type="submit" className={`${BTN_SM} shrink-0 whitespace-nowrap`}>
          {submitLabel}
        </button>
        <button type="button" className={`${BTN_SM} shrink-0 whitespace-nowrap`} onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </form>
  );
}
