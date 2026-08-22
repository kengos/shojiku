// One style-field widget, shared by every surface that edits the `Style` shape
// (the property panel's item style, the document-defaults cascade root, a
// styles-registry entry): a `select` for an enum field, a datalist-backed combo
// for `fontFamily` when the host supplies suggestions, else a free-text input.
// The caller owns the op the commit builds (item-scoped vs root-scoped), so this
// widget carries no wire knowledge — it only picks the input by field kind.
//
// The document-defaults surface passes `seedMode`: an unset field then shows the
// engine fallback as a PLACEHOLDER rather than as a value ("seed the display,
// author only what changed") — text fields via `SeededField`, selects by keeping their unset
// option (whose label names the fallback). Filling the box with the fallback
// instead read as a setting the document had made, which is the misreading this
// surface exists to avoid. Every other surface omits `seedMode` and renders
// exactly as before.
//
// `optionLabel` localizes an enum option's WIRE spelling for display
// (`normal` → a localized word); the value committed is always the wire spelling.

import { ComboField, SelectField } from './choiceFields';
import { TextField } from './fields';
import { SeededField } from './SeededField';
import type { StyleFieldSpec } from './styleFieldSpecs';

export interface StyleFieldInputProps {
  readonly spec: StyleFieldSpec;
  readonly label: string;
  readonly value: string;
  /** The "unset" option label for a select (the cleared / inherited state). */
  readonly noneLabel: string;
  /** Host-supplied family suggestions; when non-empty, `fontFamily` becomes a
   * datalist combo (free entry still allowed). */
  readonly fontFamilies: readonly string[];
  /** The datalist id for the fontFamily combo (unique per surface). */
  readonly familyListId: string;
  readonly onCommit: (value: string) => void;
  /** The defaults surface: show the engine fallback as a placeholder / unset
   * option label rather than as a value, and guard text-field no-op blurs. */
  readonly seedMode?: boolean;
  /** The engine fallback this key renders at while unset. Absent for a
   * host-derived default the host did not supply (fontFamily) → placeholder. */
  readonly seed?: string;
  /** Placeholder when a seeded field has neither an authored value nor a seed. */
  readonly placeholder?: string;
  /** The unit a BARE value carries (`'pt'` on a length field) — shown in the
   * field's suffix badge while the value/placeholder is a bare numeral. */
  readonly unit?: string;
  /** The badge's hover bubble naming the other units the key takes. Passed
   * through to the seeded field; inert on a select or a plain text field. */
  readonly unitHint?: string;
  /** Wire spelling → display label for an enum option (localized). Absent → the
   * wire spelling is shown as-is (every non-defaults surface today). */
  readonly optionLabel?: (option: string) => string;
}

export function StyleFieldInput({
  spec,
  label,
  value,
  noneLabel,
  fontFamilies,
  familyListId,
  onCommit,
  seedMode,
  seed,
  placeholder,
  unit,
  unitHint,
  optionLabel,
}: StyleFieldInputProps) {
  if (spec.kind === 'select') {
    return (
      <SelectField
        label={label}
        value={value}
        options={spec.options}
        noneLabel={noneLabel}
        optionLabel={optionLabel}
        onCommit={onCommit}
      />
    );
  }
  if (seedMode) {
    return (
      <SeededField
        label={label}
        authored={value}
        seed={seed}
        placeholder={placeholder}
        unit={unit}
        unitHint={unitHint}
        options={spec.key === 'fontFamily' && fontFamilies.length > 0 ? fontFamilies : undefined}
        listId={spec.key === 'fontFamily' && fontFamilies.length > 0 ? familyListId : undefined}
        onCommit={onCommit}
      />
    );
  }
  if (spec.key === 'fontFamily' && fontFamilies.length > 0) {
    return (
      <ComboField
        label={label}
        value={value}
        options={fontFamilies}
        listId={familyListId}
        onCommit={onCommit}
      />
    );
  }
  return <TextField label={label} value={value} onCommit={onCommit} />;
}
