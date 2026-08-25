// The sample-value widgets of the data-item editor: one editable value per
// field kind, and the read-only rendering a mounted host (engineer-owned params)
// shows instead.
//
// A string kind gets a ROOMY textarea — the novel-length genkoyoshi body text is the
// case that motivated the fullscreen editor — while number/date/boolean/datetime
// reuse the compact widgets. A field declaring a closed `enum` set gets a SELECT
// over those members instead of free entry, labeled with the words the document
// prints for each value: picking is safe where typing a machine value is not.
// Every input is uncontrolled + commit-on-blur + changed-guard, keyed by its
// value at the call site so an external change (variant switch, undo) reseeds it
// while a sibling edit survives — PLUS a reseed nonce, because the call site's
// key cannot see a commit that does not MOVE the value. Two kinds here do
// exactly that: a cleared `datetime` authors nothing (there is no blank RFC
// 3339 value to write), and a `number` goes through `coerceSampleValue`, which
// runs `Number(raw)` — so `40.0` over a 40 authors 40. Without the nonce the
// entry the editor did not take stays on screen. See `panel/useReseedKey`.

import { useI18n } from '../i18n/context';
import type { EnumOption } from '../palette/fieldDisplay';
import { Field } from '../panel/fields';
import { useReseedKey } from '../panel/useReseedKey';
import {
  composeDateTime,
  needsSecondsStep,
  representativeOffset,
  splitDateTime,
} from '../sample/datetime';
import type { SampleKind } from '../sample/model';
import { INPUT } from '../ui/chrome';
import { EnumValueField, offerable } from './enumValue';

interface ValueFieldProps {
  readonly label: string;
  readonly kind: SampleKind;
  readonly value: string;
  readonly engineLocale?: string;
  /** The field's declared `enum` members; empty when it declares none. */
  readonly options?: readonly EnumOption[];
  /** Suppress the raw-value caption — an array row shows one value per row
   * and the caption would repeat under every one of them. */
  readonly compact?: boolean;
  readonly onCommit: (raw: string) => void;
}

/** One editable sample value, widget per kind. A string kind gets a ROOMY
 * textarea (the manuscript case is the point); the rest reuse the compact
 * widgets the sample panel had. Keyed by value at the call site so an external
 * change reseeds it. */
export function ValueField({
  label,
  kind,
  value,
  engineLocale,
  options,
  compact,
  onCommit,
}: ValueFieldProps) {
  // Above every early return: only one widget renders per kind, so they share
  // the one nonce.
  const [inputKey, reseed] = useReseedKey(value);
  if (options !== undefined && offerable(options)) {
    return (
      <EnumValueField
        label={label}
        value={value}
        options={options}
        compact={compact}
        onCommit={onCommit}
      />
    );
  }
  if (kind === 'boolean') {
    return (
      <Field label={label}>
        <input
          type="checkbox"
          defaultChecked={value === 'true'}
          onChange={(event) => onCommit(String(event.currentTarget.checked))}
        />
      </Field>
    );
  }
  const split = kind === 'datetime' ? splitDateTime(value) : null;
  if (kind === 'datetime' && split !== null) {
    return (
      <Field label={label}>
        <input
          key={inputKey}
          type="datetime-local"
          step={needsSecondsStep(split.wallClock) ? 1 : undefined}
          defaultValue={split.wallClock}
          onBlur={(event) => {
            const wall = event.currentTarget.value;
            // A CLEARED datetime authors nothing — there is no blank RFC 3339
            // value to write — so only the nonce can put the sample back.
            if (wall === '') {
              reseed();
              return;
            }
            // Compare the COMPOSED wire value, not the two wall-clock strings:
            // this input shows a converted view of the wire, and the browser
            // is free to spell it differently (jsdom hands back
            // `…T05:06:07.000` for a value authored `…T05:06:07`). Only the
            // composed form answers "would this move the document?", and
            // without it a bare tab-through re-authored the sample.
            const next = composeDateTime(wall, split.offset, representativeOffset(engineLocale));
            if (next === value) {
              return;
            }
            onCommit(next);
            reseed();
          }}
        />
      </Field>
    );
  }
  if (kind === 'string') {
    return (
      <Field label={label}>
        <textarea
          key={inputKey}
          className={`${INPUT} min-h-[9rem] resize-y font-mono leading-relaxed`}
          defaultValue={value}
          onBlur={(event) => {
            if (event.currentTarget.value !== value) {
              onCommit(event.currentTarget.value);
              reseed();
            }
          }}
        />
      </Field>
    );
  }
  return (
    <Field label={label}>
      <input
        key={inputKey}
        type={kind === 'date' ? 'date' : 'number'}
        defaultValue={value}
        onBlur={(event) => {
          if (event.currentTarget.value !== value) {
            onCommit(event.currentTarget.value);
            reseed();
          }
        }}
      />
    </Field>
  );
}

export function ReadonlyValue({
  value,
  options,
}: {
  readonly value: string;
  readonly options?: readonly EnumOption[];
}) {
  const { t } = useI18n();
  if (value === '') {
    return <p className="m-0 text-sm text-muted">{t('sample.emptyReadOnly')}</p>;
  }
  // A labeled member reads as the words the document prints, with the machine
  // value beside it — the engineer reviewing a mounted host wants both.
  const label = options?.find((option) => option.value === value)?.label ?? '';
  return (
    <p className="m-0 whitespace-pre-wrap text-text [overflow-wrap:anywhere]">
      {label === '' ? value : label}
      {label === '' ? null : <span className="ml-2 font-mono text-sm text-muted">{value}</span>}
    </p>
  );
}
