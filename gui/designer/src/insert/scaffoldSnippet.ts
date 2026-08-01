// Realizing a scaffold spec: a `ScaffoldSpec` plus a presentation variant
// become ONE `insertItem` snippet — a table, a repeat_flow card list, or a
// list. All values are engine-canonical and probed against the real engine to
// render diagnostics-free AND visibly (the insert-menu snippet rule): no column
// widths (the engine's equal-split is the canonical default), no fixed heights
// (rows/cards/lists auto-size), a 0.5pt border makes a card visible.
// Framework-free.

import type { SnippetValue } from '@shojiku/designer-core';
import { chipWire } from '../text/chipModel';
import { mintDeclName } from '../text/declMint';
import type { ScaffoldSpec, ScaffoldVariant } from './scaffold';

/** A list's per-entry text. Against an engine that understands `bindings:` the
 * FIRST field always shows: a key the interpolation charset cannot spell (a
 * Japanese field name — the blank-start default) gets a declared ASCII name
 * rather than being skipped. Against an older one the first charset-SAFE field
 * is the best a list can do, and a spec with none degrades to entries printing
 * directly. Every wire slice comes from the ONE parser (`chipWire`), so the
 * charset is never restated here. */
function listSnippet(spec: ScaffoldSpec, declarations: boolean): SnippetValue {
  const data = { key: spec.sourceKey };
  const first = spec.columns[0];
  if (declarations && first !== undefined) {
    const bare = chipWire(first.key);
    if (bare !== null) {
      return { type: 'list', data, text: bare };
    }
    // Nothing is declared yet on a fresh scaffold, so no name can collide. The
    // computed key keeps a hostile `__proto__`-shaped name inert own data.
    const minted = mintDeclName(first.key, new Set());
    return {
      type: 'list',
      data,
      text: minted.wire,
      bindings: { [minted.name]: { key: first.key } },
    };
  }
  for (const column of spec.columns) {
    const bare = chipWire(column.key);
    if (bare !== null) {
      return { type: 'list', data, text: bare };
    }
  }
  return { type: 'list', data };
}

/** The one `insertItem` snippet a spec + variant realize. Total: a field-less
 * spec has only one honest presentation, so table/card requests degrade to
 * the list (`variantsFor` already gates the UI; the model never refuses).
 * `declarations` reports whether the engine understands `bindings:`. */
export function scaffoldSnippet(
  spec: ScaffoldSpec,
  variant: ScaffoldVariant,
  declarations = false,
): SnippetValue {
  if (variant === 'list' || spec.columns.length === 0) {
    return listSnippet(spec, declarations);
  }
  if (variant === 'table') {
    return {
      type: 'table',
      data: { key: spec.sourceKey },
      columns: spec.columns.map((column) => {
        const data: Record<string, SnippetValue> = { key: column.key };
        if (column.format !== undefined) {
          data.format = column.format;
        }
        return { label: column.label, data };
      }),
    };
  }
  return {
    type: 'repeat_flow',
    data: { key: spec.sourceKey },
    gap: 8,
    item: {
      box: { padding: 8 },
      style: { borderWidth: 0.5 },
      items: spec.columns.map((column) => ({ type: 'text', data: { key: column.key } })),
    },
  };
}
