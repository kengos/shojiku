// How the style form's FIELDS are laid out — the row table, which widget each
// key earns, and the grid that renders them. Split from what the form COMMITS
// (`StyleForm`) so the layout is editable without touching the draft/plan
// dispatch, and so `STYLE_FORM_ROWS` sits beside the widget routing it drives.
//
// Colour fields render through the shared `ColorSwatchPicker` (never a
// hand-typed hex — typing is dangerous); everything else goes through the one
// `StyleFieldInput` widget the item panel / defaults / registry all share.

import { useI18n } from '../i18n/context';
import { ColorSwatchPicker } from '../ui/ColorSwatchPicker';
import { FIELD_LABEL, PANEL_SWATCH_TRIGGER } from '../ui/chrome';
import { StyleFieldInput } from './StyleFieldInput';
import { STYLE_FIELDS, type StyleFieldSpec } from './styleFieldSpecs';
import { styleOptionLabel } from './styleLabels';

/** The field layout: short fields pair two per row, `fontFamily` / `textAlign`
 * span alone (mirrors the document-defaults surface). A drift-guard test pins
 * this against `STYLE_FIELDS` so a new style key must be PLACED here, never
 * silently dropped. */
export const STYLE_FORM_ROWS: readonly (readonly string[])[] = [
  ['fontSize', 'lineHeight'],
  ['fontFamily'],
  ['fontWeight', 'fontStyle'],
  ['textAlign'],
  ['color', 'backgroundColor'],
];

/** Colour fields render through the swatch picker, everything else through the
 * shared per-kind widget. */
const COLOR_KEYS = new Set(['color', 'backgroundColor']);

/** The spec for a laid-out key. Indexing a filtered list keeps this total
 * without a `find` whose miss is unreachable (the layout is drift-guarded). */
function specByKey(key: string): StyleFieldSpec {
  return STYLE_FIELDS.filter((spec) => spec.key === key)[0];
}

/** One laid-out field: the swatch picker for a colour key, else the shared
 * per-kind widget. The draft holds display strings; the commit updates it. */
function FormField({
  spec,
  value,
  fontFamilies,
  index,
  onCommit,
}: {
  readonly spec: StyleFieldSpec;
  readonly value: string;
  readonly fontFamilies: readonly string[];
  readonly index: number;
  readonly onCommit: (value: string) => void;
}) {
  const { t } = useI18n();
  const label = t(spec.labelKey);
  if (COLOR_KEYS.has(spec.key)) {
    return (
      <div className="mb-2">
        <span className={FIELD_LABEL}>{label}</span>
        <ColorSwatchPicker
          label={label}
          value={value}
          onCommit={onCommit}
          triggerClassName={PANEL_SWATCH_TRIGGER}
          customLabel={t('toolbar.color.custom')}
          clearLabel={t('toolbar.color.clear')}
        />
      </div>
    );
  }
  return (
    <StyleFieldInput
      spec={spec}
      label={label}
      value={value}
      noneLabel={t('panel.field.formatNone')}
      optionLabel={(option) => styleOptionLabel(t, spec.key, option)}
      fontFamilies={fontFamilies}
      familyListId={`sj-style-form-family-${index}`}
      onCommit={onCommit}
    />
  );
}

export interface StyleFormFieldsProps {
  /** The form's local draft — display strings keyed by style key. */
  readonly draft: Readonly<Record<string, string>>;
  readonly fontFamilies: readonly string[];
  readonly onCommit: (key: string, value: string) => void;
}

/** The laid-out style fields of the create/update form. */
export function StyleFormFields({ draft, fontFamilies, onCommit }: StyleFormFieldsProps) {
  return (
    <div className="flex flex-col gap-1">
      {STYLE_FORM_ROWS.map((row) => (
        <div key={row.join()} className={row.length === 2 ? 'grid grid-cols-2 gap-x-3.5' : ''}>
          {row.map((key) => {
            const spec = specByKey(key);
            return (
              <FormField
                key={key}
                spec={spec}
                value={draft[spec.key] ?? ''}
                fontFamilies={fontFamilies}
                index={STYLE_FIELDS.indexOf(spec)}
                onCommit={(value) => onCommit(spec.key, value)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
