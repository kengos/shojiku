// The cascade-root half of `defaults:`: the inherited style keys every item
// falls back to (the base-text section). A live view — it re-reads
// `controller.read('defaults')` each render and dispatches a root-addressed
// named op per edit (AI parity, no direct mutation). The controls are the shared
// value-keyed widgets, so each self-reseeds when its own value changes (undo,
// selection) — no body-wide revision remount, which would drop an in-progress
// sibling edit.
//
// One arrangement — `DefaultsStyleSection`, the document-settings section
// (rowed, with the intro line and the recommended-size hint). A second, flat
// arrangement existed for a standalone stacked form that no product surface
// ever rendered.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { ColorSwatchPicker } from '../ui/ColorSwatchPicker';
import { FIELD_LABEL, PANEL_SWATCH_TRIGGER } from '../ui/chrome';
import { defaultStyleOp, INHERITED_STYLE_FIELDS, readDefaultsView } from './defaultsModel';
import { ENGINE_STYLE_DEFAULTS } from './engineDefaults';
import { applyPanelOp } from './model';
import { StyleFieldInput } from './StyleFieldInput';
import { styleOptionLabel, unsetLabel } from './styleLabels';

/** The body size this surface RECOMMENDS for a document. The engine's own
 * fallback is 10pt — right for a fallback, small for body copy — so the section
 * names a readable size (≈14px on screen) and offers one click to author it.
 * It is a suggestion the user applies, never a value the GUI writes on its own:
 * an untouched document still renders at the engine default. */
const RECOMMENDED_FONT_SIZE = '10.5';

/** How the base-text section arranges its fields: the short ones sit two per
 * row, `fontFamily` (a long id) keeps a row to itself. A single column ran the
 * section past its height, which is what the section rail exists to avoid.
 * A drift-guard test pins this against `INHERITED_STYLE_FIELDS` — a new
 * inherited style key must be PLACED here, not silently dropped. */
const STYLE_ROWS: readonly (readonly string[])[] = [
  ['fontSize', 'lineHeight'],
  ['fontFamily'],
  ['fontWeight', 'fontStyle'],
  ['textAlign', 'color'],
];

/** The spec for a laid-out key. Indexing a filtered list keeps this total
 * without a `find` whose miss is unreachable (the layout is drift-guarded). */
function fieldByKey(key: string) {
  return INHERITED_STYLE_FIELDS.filter((spec) => spec.key === key)[0];
}

/** The `fontSize` spec the recommendation authors through (the same builder the
 * field itself uses, so the op is identical to typing the value). */
const FONT_SIZE_FIELD = fieldByKey('fontSize');

/** The engine default seeded into a defaults-style field: the locale's default
 * face for `fontFamily` (host-derived, may be absent), the static engine
 * default otherwise. */
function seedFor(key: string, defaultFontFamily?: string): string | undefined {
  return key === 'fontFamily' ? defaultFontFamily : ENGINE_STYLE_DEFAULTS[key];
}

/** The document's default text colour as a swatch picker — the same primitive
 * the decoration tab uses, so colour is picked here too and never hand-typed. An unset
 * key shows the engine fallback on the chip (what the document renders at);
 * clearing commits `''`, which hands the key back to that fallback. */
function DefaultColorField({
  label,
  value,
  fallback,
  onCommit,
}: {
  readonly label: string;
  readonly value: string;
  readonly fallback: string;
  readonly onCommit: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-2">
      <span className={FIELD_LABEL}>{label}</span>
      <ColorSwatchPicker
        label={label}
        value={value === '' ? fallback : value}
        onCommit={onCommit}
        triggerClassName={PANEL_SWATCH_TRIGGER}
        customLabel={t('toolbar.color.custom')}
        clearLabel={t('toolbar.color.clear')}
      />
    </div>
  );
}

export interface DefaultsStyleFieldsProps {
  readonly controller: EditorController;
  readonly fontFamilies: readonly string[];
  /** The locale's default font face (the engine's `fontFamily` default) —
   * seeded into the unset family field. Absent → that field shows a localized
   * placeholder instead of a seed value. */
  readonly defaultFontFamily?: string;
}

/** The one field renderer both arrangements lay out, bound to the live document
 * read and the dispatch that authors it. */
function useStyleField({ controller, fontFamilies, defaultFontFamily }: DefaultsStyleFieldsProps) {
  const { t } = useI18n();
  const view = readDefaultsView(controller.read('defaults'));
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);

  return (spec: (typeof INHERITED_STYLE_FIELDS)[number]) =>
    // The colour field is a swatch picker, not a hex string to type
    // (picking is safe, typing is dangerous) — the same primitive the decoration tab uses.
    spec.key === 'color' ? (
      <DefaultColorField
        key={spec.key}
        label={t(spec.labelKey)}
        value={view.style[spec.key]}
        fallback={ENGINE_STYLE_DEFAULTS.color}
        onCommit={(v) => dispatch(defaultStyleOp(spec, v))}
      />
    ) : (
      <StyleFieldInput
        key={spec.key}
        spec={spec}
        label={t(spec.labelKey)}
        value={view.style[spec.key]}
        noneLabel={unsetLabel(t, spec.key, seedFor(spec.key, defaultFontFamily))}
        fontFamilies={fontFamilies}
        familyListId="sj-defaults-family"
        seedMode
        seed={seedFor(spec.key, defaultFontFamily)}
        unit={spec.kind === 'length' ? 'pt' : undefined}
        placeholder={
          spec.key === 'fontFamily' && defaultFontFamily === undefined
            ? t('defaults.familyPlaceholder')
            : undefined
        }
        optionLabel={(option) => styleOptionLabel(t, spec.key, option)}
        onCommit={(v) => dispatch(defaultStyleOp(spec, v))}
      />
    );
}

/** The document-settings section: the same fields laid out in rows, introduced
 * by what an untouched field MEANS and closed by the recommended-size hint. */
export function DefaultsStyleSection(props: DefaultsStyleFieldsProps) {
  const { t } = useI18n();
  const styleField = useStyleField(props);
  const dispatch = (op: Op | null) => applyPanelOp(props.controller, op);
  return (
    <div>
      {/* What an untouched field MEANS — the question this surface's old
          default tags raised without answering: nothing here is authored until
          you change it, and an unchanged key is not written to the file. */}
      <p className="mt-0 mb-3 text-sm text-muted">{t('defaults.styleIntro')}</p>
      {/* Short fields pair up two per row: the seven-field single column ran
          past the section's height, and the rail exists so a section fits. */}
      {STYLE_ROWS.map((row) => (
        <div key={row.join()} className={row.length === 2 ? 'grid grid-cols-2 gap-x-3.5' : ''}>
          {row.map((key) => styleField(fieldByKey(key)))}
        </div>
      ))}
      <p className="mt-1 mb-0 text-sm text-muted">
        {t('defaults.sizeHint', { size: RECOMMENDED_FONT_SIZE })}{' '}
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 text-accent underline"
          onClick={() => dispatch(defaultStyleOp(FONT_SIZE_FIELD, RECOMMENDED_FONT_SIZE))}
        >
          {t('defaults.sizeApply', { size: RECOMMENDED_FONT_SIZE })}
        </button>
      </p>
    </div>
  );
}
