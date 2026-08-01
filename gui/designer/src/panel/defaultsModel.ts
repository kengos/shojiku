// Pure form model for the document-defaults surface: it reads the display view
// out of the materialized `defaults:` map (`Editor.read('defaults')`) and builds
// the root-addressed named ops each control dispatches. Framework-free so the
// extraction + op construction are exhaustively unit-testable; the component
// stays thin over it. Every edit is a root-addressed `designer-core` op (AI
// parity — the panel never mutates the document), reusing the shared leaf
// builders with an omitted `path` (the document root).

import type { Op } from '@shojiku/designer-core';
import { lengthOp, numberOp, plainTextOp } from './model';
import { STYLE_FIELDS, type StyleFieldSpec } from './styleFieldSpecs';

/** Style keys that do NOT inherit ([style.md] — among the panel's editable
 * subset only `backgroundColor` is non-inherited). They are dead controls at
 * the cascade root (`defaults.style`), so the defaults editor omits them; the
 * drift-guard test pins that the derived set stays exactly the inherited ones. */
const NON_INHERITED_AT_ROOT = new Set<string>(['backgroundColor']);

/** The `defaults.style` editable fields: the inherited subset of `STYLE_FIELDS`
 * (a cascade-root style only makes sense for inherited properties). */
export const INHERITED_STYLE_FIELDS: readonly StyleFieldSpec[] = STYLE_FIELDS.filter(
  (field) => !NON_INHERITED_AT_ROOT.has(field.key),
);

/** Curated ISO 4217 currency-code suggestions for the picker (the SWATCHES
 * precedent — free entry stays possible through the combo). Every entry is a
 * 3-letter uppercase code (pinned by a unit test). */
export const CURRENCY_SUGGESTIONS: readonly string[] = [
  'JPY',
  'USD',
  'EUR',
  'GBP',
  'CNY',
  'KRW',
  'TWD',
  'HKD',
  'SGD',
  'AUD',
  'CAD',
  'INR',
  'PHP',
  'THB',
];

/** The document-defaults display view. `locale` / `currency` are the bare wire
 * strings (empty when unset); `style` holds one display value per inherited
 * field key. */
export interface DefaultsView {
  readonly locale: string;
  readonly currency: string;
  readonly style: Readonly<Record<string, string>>;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** A scalar's display string: strings verbatim, numbers stringified, anything
 * else empty (the field reads as unset). */
function display(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return '';
}

/** Read the defaults view from a materialized `defaults:` node. A missing key
 * (`undefined`) or a garbage non-map value both read as all-empty — the surface
 * shows blank fields, and a first edit auto-creates `defaults:`. */
export function readDefaultsView(raw: unknown): DefaultsView {
  const rec = record(raw);
  const style = record(rec?.style) ?? {};
  return {
    locale: display(rec?.locale),
    currency: display(rec?.currency),
    style: Object.fromEntries(INHERITED_STYLE_FIELDS.map((f) => [f.key, display(style[f.key])])),
  };
}

/** The op for a `defaults.locale` edit (empty clears the key). */
export function localeOp(raw: string): Op {
  return plainTextOp(undefined, ['defaults', 'locale'], raw);
}

/** The op for a `defaults.currency` edit (empty clears the key). */
export function currencyOp(raw: string): Op {
  return plainTextOp(undefined, ['defaults', 'currency'], raw);
}

/** The op for one `defaults.style.<prop>` edit, dispatched by the field kind
 * (the panel's per-kind policy, reused): `number` may return `null` for a
 * non-finite value; the others always produce an op (empty clears). */
export function defaultStyleOp(spec: StyleFieldSpec, raw: string): Op | null {
  const keys = ['defaults', 'style', spec.key];
  if (spec.kind === 'number') {
    return numberOp(undefined, keys, raw);
  }
  if (spec.kind === 'length') {
    return lengthOp(undefined, keys, raw);
  }
  return plainTextOp(undefined, keys, raw);
}
