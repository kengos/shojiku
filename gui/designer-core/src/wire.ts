// Type-only read views of the template wire format (the MVP key subset),
// mirroring the `engine/core` serde field names (camelCase like `fontSize`,
// `styleNames`). There is NO runtime code here: the `eemeli/yaml` CST owns
// round-trip, and these types describe the shape the property panel reads. The
// engine's `engine/core/src/template.rs` is the source of truth — keep this in
// sync as the panel grows to cover more keys.

export type LengthValue = number | string;

export interface Style {
  fontSize?: LengthValue;
  fontFamily?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: number;
  color?: string;
  backgroundColor?: string;
}

export interface OptBox {
  x?: LengthValue;
  y?: LengthValue;
  w?: LengthValue;
  h?: LengthValue;
}

/** A data binding (`engine/core` `Binding`): which params key to read and which
 * format variant renders it. Always a map on the wire (never a bare string);
 * the engine requires `key`, but the panel's read view tolerates a partial map
 * mid-edit. `format` names a builtin variant or a template `formats:` entry. */
export interface DataBinding {
  key?: string;
  format?: string;
}

export interface TextItem {
  type: 'text';
  text?: string;
  data?: DataBinding;
  id?: string;
  box?: OptBox;
  style?: Style;
  styleNames?: string[];
}

export interface RectItem {
  type: 'rect';
  id?: string;
  box?: OptBox;
  style?: Style;
  styleNames?: string[];
}

export interface ImageItem {
  type: 'image';
  src?: string;
  data?: string;
  id?: string;
  box?: OptBox;
}

export type Item = TextItem | RectItem | ImageItem;

export interface FlowBody {
  box?: OptBox;
  gap?: LengthValue;
  items?: Item[];
}

export interface Sections {
  header?: unknown;
  body?: FlowBody;
  footer?: unknown;
}

export interface PageSpec {
  size?: string | { w: LengthValue; h: LengthValue };
  orientation?: 'portrait' | 'landscape';
  margin?: unknown;
}

export interface TemplateDefaults {
  locale?: string;
  currency?: string;
  style?: Style;
  formats?: Record<string, unknown>;
}

export interface Template {
  version?: number | string;
  name?: string;
  page?: PageSpec;
  defaults?: TemplateDefaults;
  styles?: Record<string, Style>;
  /** Named format registry (top-level, parallel to `styles`) — the names the
   * panel's format picker lists. Distinct from `defaults.formats` (per-type
   * default picks). */
  formats?: Record<string, unknown>;
  sections?: Sections;
}
