// The READ side of the property-panel model: it narrows a materialized item
// node (`Editor.read`) into the display values the panel's fields show. Pure and
// framework-free, so the extraction is exhaustively unit-testable. The op
// builders a field edit dispatches live in `model.ts`; the format-picker rows in
// `formatModel.ts`.
//
// Every narrowing degrades rather than throws — a hostile or unreadable node
// reads as unset, never as a crash — and no lookup indexes a plain-object table
// with a document-derived key.

import { STYLE_FIELDS } from './styleFieldSpecs';

export type ContentMode = 'text' | 'data';

export const BOX_AXES = ['x', 'y', 'w', 'h'] as const;
export type BoxAxis = (typeof BOX_AXES)[number];

/** The wire types that take NO `box:` key at all (`line` draws from
 * `from`/`to` points, `page_break` takes only `id`) — the engine rejects the
 * key as a parse error (`deny_unknown_fields`). The ONE home for that rule:
 * the placement tab, the placement classifier, and canvas manipulation all
 * consult this set rather than keeping their own copies. */
export const BOXLESS_TYPES: ReadonlySet<string> = new Set(['line', 'page_break']);

export interface ItemView {
  readonly type: string;
  readonly hasText: boolean;
  readonly hasData: boolean;
  readonly contentMode: ContentMode;
  readonly text: string;
  readonly dataKey: string;
  /** The binding's authored `data.scope` ('' when unset — the engine's
   * `element` default). Only `document` is meaningful to the picker; any
   * other authored value is reported verbatim so the badge never claims a
   * scope the file does not carry. */
  readonly dataScope: string;
  readonly format: string;
  /** The binding's blank-form placeholder (`data.placeholder`) — drawn when
   * the bound value is absent/empty. Empty string when unset. */
  readonly placeholder: string;
  /** An `image` item's template-time source (`data:` URI, inline SVG, or bundled
   * path). Empty for non-image items or a data-bound image. */
  /** `page_number`'s own `format` pattern (`{page} / {pages}`). */
  readonly pageFormat: string;
  readonly src: string;
  /** An `image` item's `fit` mode (empty = the engine default `contain`). */
  readonly fit: string;
  readonly styleNames: readonly string[];
  readonly style: Readonly<Record<string, string>>;
  readonly box: Readonly<Record<BoxAxis, string>>;
}

/** A materialized node as a plain map, or `undefined` for anything else (a
 * scalar, an array, null). Shared with the op builders in `model.ts`, whose
 * key-presence probe narrows the same way. */
export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** A scalar's display string: strings verbatim, numbers stringified, anything
 * else empty (the field reads as unset). Shared with the toolbar's effective-
 * style resolution (registry/defaults values go through the same narrowing). */
export function display(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return '';
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Extract the panel's display values from a materialized item node, or `null`
 * when the node is not an item map (nothing editable to show). */
export function readItemView(raw: unknown): ItemView | null {
  const rec = record(raw);
  if (rec === undefined || typeof rec.type !== 'string') {
    return null;
  }
  const data = record(rec.data);
  const style = record(rec.style) ?? {};
  const box = record(rec.box) ?? {};
  return {
    type: rec.type,
    hasText: rec.text !== undefined,
    hasData: data !== undefined,
    contentMode: data !== undefined ? 'data' : 'text',
    text: display(rec.text),
    dataKey: display(data?.key),
    dataScope: typeof data?.scope === 'string' ? data.scope : '',
    format: display(data?.format),
    placeholder: display(data?.placeholder),
    // `page_number` carries its pattern at the item root, not under `data`.
    pageFormat: display(rec.format),
    src: display(rec.src),
    fit: display(rec.fit),
    styleNames: stringList(rec.styleNames),
    style: Object.fromEntries(STYLE_FIELDS.map((f) => [f.key, display(style[f.key])])),
    box: {
      x: display(box.x),
      y: display(box.y),
      w: display(box.w),
      h: display(box.h),
    },
  };
}

/** The registry names (styles or formats) a picker offers — the map's keys, or
 * `[]` when the registry is absent. */
export function registryNames(raw: unknown): string[] {
  return Object.keys(record(raw) ?? {});
}

/** A one-line summary of an `image` item's `src` for the panel: the detected
 * format acronym and the approximate encoded size (KiB). The `src` itself is
 * never rendered as text — a multi-megabyte data-URI in a field is a UX/perf
 * hazard, and this keeps the panel to a glanceable label. */
export function imageSourceSummary(src: string): { readonly format: string; readonly kib: number } {
  const kib = Math.round(src.length / 1024);
  const match = /^data:image\/([a-z+-]+)/.exec(src);
  if (match === null) {
    return { format: 'file', kib };
  }
  return { format: match[1] === 'svg+xml' ? 'SVG' : match[1].toUpperCase(), kib };
}
