// Which owner refuses a whole saved BLOCK — the block-level counterpart of
// `canvas/dnd`'s per-TYPE `refusedOwner`, and the only part of the block
// feature that walks a node tree. Split from `blockModel.ts`, which owns the
// library (save / restore / caps / the menu group) and had run out of room:
// the walk is a different concern with a different threat model, and it is the
// half a future second refusal would grow in.
//
// Framework-free, and hostile-input bounded like every other walk in this area
// (`palette/caps.ts` is the sibling posture): the `blocks` prop is
// HOST-supplied and the Designer does not sanitize it — `sanitizeBlocks` is a
// host export, run by the standalone app's persistence layer and by nobody
// else — so this runs over whatever an embedding host hands in, on every
// menubar render.

import { refusedOwner } from '../canvas/dnd';

/** Maximum nesting this walk descends. A backstop rather than the working
 * bound: `designer-core`'s `MAX_SNIPPET_DEPTH` is 16 and every block that came
 * through `sanitizeBlocks` is within it, so on the sanitized path this cannot
 * fire — it exists for the unsanitized prop. */
const MAX_WALK_DEPTH = 24;

/** Maximum nodes the walk visits, mirroring `designer-core`'s
 * `MAX_SNIPPET_NODES`. This is the bound that does the work, and a depth cap
 * cannot stand in for it: the walk re-reads per node rather than tracking what
 * it has seen, so a graph with SHARED sub-objects re-expands — at fan-out 2
 * and depth 24 that is ~3.4e7 visits from 25 objects. `JSON.parse` cannot
 * produce a shared reference, but the library is host-owned and app-global,
 * and `structuredClone`/IndexedDB both preserve sharing and cycles. */
const MAX_WALK_NODES = 256;

function itemsOf(node: unknown): readonly unknown[] {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    return [];
  }
  // Own-property guarded: a node that merely INHERITS `items` carries no
  // children of its own, and walking a prototype's array would answer about
  // something the document does not have.
  if (!Object.hasOwn(node, 'items')) {
    return [];
  }
  const items = (node as Record<string, unknown>).items;
  return Array.isArray(items) ? items : [];
}

function walk(value: unknown, depth: number, budget: { nodes: number }): 'cell' | null {
  budget.nodes -= 1;
  if (depth > MAX_WALK_DEPTH || budget.nodes < 0) {
    return null;
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if (refusedOwner((value as Record<string, unknown>).type) !== null) {
      return 'cell';
    }
  }
  for (const child of itemsOf(value)) {
    if (walk(child, depth + 1, budget) !== null) {
      return 'cell';
    }
  }
  return null;
}

/** Which owner refuses this block, or `null` when none does.
 *
 * It walks the block's `items` CHAIN, because a `cell` target's refusal travels
 * down it: the engine's data scope is not cleared by a container, so a table
 * wrapped in one is skipped exactly as a bare table is. It deliberately does
 * NOT descend into the block's own `cell:` / `item:` / `columns[]`
 * sub-templates. A table in there is already dead wherever the block lands, so
 * refusing on it would say "not here" about something no target fixes, and
 * would leave a block the user successfully SAVED insertable nowhere at all.
 * Only two of those three can ever decide an answer: `columns[]` exists solely
 * on a `table`, which the walk has already refused by its own type.
 *
 * The answer is about the WHOLE block, and the refusal its callers build on it
 * is too — wider than the engine's, which drops only the table and still draws
 * the container and the siblings around it. That is the deliberate choice:
 * a block that lands half-drawn is the failure this gate exists to prevent,
 * and the reason string names the pairing rather than the item.
 *
 * Bounded over untrusted host storage: depth AND node capped, own-property
 * guarded, never throws. Past either cap the block reads as unrestricted,
 * which is what it was before this walk existed. */
export function blockRefusedOwner(value: unknown): 'cell' | null {
  return walk(value, 0, { nodes: MAX_WALK_NODES });
}
