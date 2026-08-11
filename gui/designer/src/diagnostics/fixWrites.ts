// The quick-fix builders that WRITE a value, as opposed to the removal family
// in `fixModel.ts`. The distinction is not cosmetic: a removal is fully
// described by the diagnostic's own message ("these keys do nothing here"), so
// its button needs only a verb — while a write puts a number the author never
// typed into their document, which makes the VALUE the decision. Every builder
// here therefore reports the value it would write, and the panel renders it in
// the button's label, so nothing is authored that the label did not name.
//
// All of them are hostile-input safe by construction: a diagnostic's args and
// the document node reached through `read` are both attacker-influenced, so a
// builder returns `null` for anything it cannot compute a FINITE, positive
// result from, and the panel then shows no button at all.

import type { Op } from '@shojiku/designer-core';
import type { ArgValue, Diagnostic } from '../engine/types';
import type { FixCandidate, ReadNode } from './fixModel';

/** The size a size-less shape is given: ≈35mm square — visible on any sheet
 * without dominating it, and square because the family includes `qr_code`,
 * which is meaningless at any other ratio. It is a starting point the author
 * then drags, not a guess at what they meant. */
const DEFAULT_SIZE_PT = 100;

/** A plain map node, or `null` for a hostile/absent read. */
function asMap(node: unknown): Record<string, unknown> | null {
  return typeof node === 'object' && node !== null && !Array.isArray(node)
    ? (node as Record<string, unknown>)
    : null;
}

/** A diagnostic arg as a finite number, or `null`. The engine sends numbers as
 * numbers, so a string here means the payload was tampered with — and a `NaN`
 * or `Infinity` reaching the arithmetic below would author a non-finite
 * coordinate into the document. */
function finiteArg(value: ArgValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The item's authored `box.w` as a finite number, or `null` when it is absent,
 * a percentage, or anything else this fix cannot arithmetic on. */
function authoredWidth(read: ReadNode, path: string): number | null {
  const node = asMap(read(path));
  if (node === null || typeof node.type !== 'string') return null;
  const box = asMap(node.box);
  const w = box?.w;
  return typeof w === 'number' && Number.isFinite(w) ? w : null;
}

/** Round to one decimal — the engine takes fractional points, but a fix that
 * writes `450.90000000000003` into someone's template is not a fix. */
function tidy(pt: number): number {
  return Math.round(pt * 10) / 10;
}

/** An item overflowing its region → shrink `box.w` by exactly the reported
 * excess. `null` unless BOTH the overflow amount and the authored width are
 * usable numbers and the result is still positive: an item narrower than its
 * own overflow cannot be fixed by shrinking, and offering the button there
 * would author a zero-or-negative width. */
export function fixOverflowWidth(
  path: string,
  diag: Diagnostic,
  read: ReadNode,
): readonly FixCandidate[] | null {
  const over = finiteArg(diag.args.over);
  const current = authoredWidth(read, path);
  if (over === null || current === null) return null;
  const next = tidy(current - over);
  if (!(next > 0)) return null;
  return [
    {
      labelKey: 'diagnostics.fix.shrinkWidth',
      labelArgs: { w: next },
      ops: [{ op: 'setScalar', path, keys: ['box', 'w'], value: next }],
    },
  ];
}

/** A shape with no drawable size → author the missing dimension(s). Only the
 * ones that are actually absent are written: a rect that has a width and no
 * height keeps its width. `null` when the box is unreadable, or when both
 * dimensions are already present (the diagnostic is then stale and the button
 * would do nothing). */
export function fixMissingSize(
  path: string,
  _diag: Diagnostic,
  read: ReadNode,
): readonly FixCandidate[] | null {
  const node = asMap(read(path));
  // `type` is what makes a node an ITEM. A stale or forged path can address a
  // section, a container's `items` list, anything — and authoring `box.w`/`box.h`
  // there produces wire the engine rejects, from a button the author trusted.
  if (node === null || typeof node.type !== 'string') return null;
  // An ABSENT box is fine — the op creates it. A box that is present but not a
  // map is not: the op layer refuses it (`not_a_map`) and the document is safe,
  // but the button would still have been offered and would do nothing when
  // pressed, which is the one thing this registry promises never to ship.
  if (node.box !== undefined && asMap(node.box) === null) return null;
  const box = asMap(node.box) ?? {};
  const missing = (['w', 'h'] as const).filter(
    (key) => !(typeof box[key] === 'number' && Number.isFinite(box[key])),
  );
  if (missing.length === 0) return null;
  return [
    {
      labelKey: 'diagnostics.fix.setSize',
      labelArgs: { size: DEFAULT_SIZE_PT },
      ops: missing.map(
        (key): Op => ({ op: 'setScalar', path, keys: ['box', key], value: DEFAULT_SIZE_PT }),
      ),
    },
  ];
}

/** An image carrying BOTH `src` and `data` → two candidates, one per key to
 * keep. Labelled by what SURVIVES, never by what is dropped: a control naming
 * the thing about to disappear is read backwards, and this one is destructive
 * in a way the author cannot see (the other source is simply gone). */
export function fixSourceConflict(
  path: string,
  _diag: Diagnostic,
  read: ReadNode,
): readonly FixCandidate[] | null {
  const node = asMap(read(path));
  if (node === null) return null;
  const candidates = (
    [
      ['src', 'data'],
      ['data', 'src'],
    ] as const
  )
    .filter(([keep, drop]) => Object.hasOwn(node, keep) && Object.hasOwn(node, drop))
    .map(
      ([keep, drop]): FixCandidate => ({
        labelKey: `diagnostics.fix.keep.${keep}`,
        ops: [{ op: 'removeKey', path, keys: [drop] }],
      }),
    );
  return candidates.length > 0 ? candidates : null;
}
