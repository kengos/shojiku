// The style keys the property panel edits, as data. A leaf module (no imports):
// the item panel, the document-defaults surface, the named-style registry, the
// style-capture flow and the format toolbar all read this ONE table, so the
// widget kind and the enum vocabulary can never drift between them.

/** The style keys the MVP panel edits (the wire `Style` subset). `kind` picks
 * the field widget; `options` lists the enum choices for a select. Enum values
 * are copied from the engine (`engine/core/src/style/enums.rs`), never guessed
 * from CSS. */
export interface StyleFieldSpec {
  readonly key: string;
  readonly labelKey: string;
  readonly kind: 'length' | 'number' | 'text' | 'select';
  /** Enum choices for a `select`; empty for the other kinds (kept non-optional
   * so a consumer never needs a `?? []` fallback that could go uncovered). */
  readonly options: readonly string[];
}

export const STYLE_FIELDS: readonly StyleFieldSpec[] = [
  { key: 'fontSize', labelKey: 'panel.field.fontSize', kind: 'length', options: [] },
  { key: 'fontFamily', labelKey: 'panel.field.fontFamily', kind: 'text', options: [] },
  {
    key: 'fontWeight',
    labelKey: 'panel.field.fontWeight',
    kind: 'select',
    options: ['normal', 'bold'],
  },
  {
    key: 'fontStyle',
    labelKey: 'panel.field.fontStyle',
    kind: 'select',
    options: ['normal', 'italic'],
  },
  {
    key: 'textAlign',
    labelKey: 'panel.field.textAlign',
    kind: 'select',
    options: ['left', 'center', 'right'],
  },
  { key: 'lineHeight', labelKey: 'panel.field.lineHeight', kind: 'number', options: [] },
  { key: 'color', labelKey: 'panel.field.color', kind: 'text', options: [] },
  { key: 'backgroundColor', labelKey: 'panel.field.backgroundColor', kind: 'text', options: [] },
];
