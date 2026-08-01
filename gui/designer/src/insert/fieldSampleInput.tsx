// The create-field modal's kind-aware sample widget: a checkbox for boolean
// (picking is safe), a native date picker for date, a number input for
// number/currency, a text input otherwise. The parent keeps the value in sync
// with the kind (a boolean value only exists under the boolean kind), so each
// branch narrows cleanly.

import { coerceSampleValue, type SampleScalar } from '../sample/model';
import { INPUT } from '../ui/chrome';
import type { FieldKind } from './scaffoldFields';

interface FieldSampleInputProps {
  readonly label: string;
  readonly kind: FieldKind;
  readonly sample: SampleScalar;
  readonly onChange: (value: SampleScalar) => void;
}

export function FieldSampleInput({ label, kind, sample, onChange }: FieldSampleInputProps) {
  if (kind === 'boolean') {
    return (
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={sample === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        {label}
      </label>
    );
  }
  // kind is text/number/currency/date here and the parent keeps `sample` in
  // sync with it (a boolean value only exists under the boolean kind, handled
  // above), so the value is a plain string/number. Currency edits as a bare
  // number — the display code/format is the field's, not the sample's.
  const numeric = kind === 'number' || kind === 'currency';
  const type = numeric ? 'number' : kind === 'date' ? 'date' : 'text';
  return (
    <label className="flex flex-col items-stretch">
      {label}
      <input
        type={type}
        className={INPUT}
        value={String(sample)}
        onChange={(event) =>
          onChange(coerceSampleValue(numeric ? 'number' : 'string', event.target.value))
        }
      />
    </label>
  );
}
