// Which owner refuses a whole saved BLOCK — the block-level counterpart of
// `canvas/dnd`'s per-TYPE `refusedOwner`, and the only part of the block
// feature that walks a node tree. Split from `blockModel.ts`, which owns the
// library (save / restore / caps / the menu group) and had run out of room:
// the walk is a different concern with a different threat model, and it is the
// half a future second refusal would grow in. It carries a second, target-
// INDEPENDENT question beside the refusal: whether the block holds an item that
// draws under no target at all (`blockNeverDraws`).
//
// Framework-free, and hostile-input bounded like every other walk in this area
// (`palette/caps.ts` is the sibling posture): the `blocks` prop is
// HOST-supplied and the Designer does not sanitize it — `sanitizeBlocks` is a
// host export, run by the standalone app's persistence layer and by nobody
// else — so this runs over whatever an embedding host hands in, on every
// menubar render.

import { refusedOwner, requiredOwner } from '../canvas/dnd';

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

function ownObject(node: unknown, key: string): unknown {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    return undefined;
  }
  return Object.hasOwn(node, key) ? (node as Record<string, unknown>)[key] : undefined;
}

/** A node's children for `blockNeverDraws`, each paired with whether it sits
 * in a sub-template: its own `items` (unchanged), then the `items` of each
 * sub-template — `repeat`'s `cell`, `repeat_flow`'s `item`, each of a table's
 * `columns[].cell` (in one). Own-property guarded at every step, like `itemsOf`,
 * and LAZY, so an oversized host-supplied `items` array is read only as far as
 * the caller's node budget lets it. A COLUMN is charged to that budget too: a
 * column without a `cell` yields no child, so without the charge a cell-less
 * `columns` array SHARED by every node would be re-scanned whole per visit. */
function* childrenOf(
  node: unknown,
  budget: { nodes: number },
): Generator<readonly [unknown, boolean]> {
  for (const child of itemsOf(node)) {
    yield [child, false];
  }
  for (const sub of [ownObject(node, 'cell'), ownObject(node, 'item')]) {
    for (const child of itemsOf(sub)) {
      yield [child, true];
    }
  }
  const columns = ownObject(node, 'columns');
  if (Array.isArray(columns)) {
    for (const column of columns) {
      budget.nodes -= 1;
      if (budget.nodes < 0) {
        return;
      }
      for (const child of itemsOf(ownObject(column, 'cell'))) {
        yield [child, true];
      }
    }
  }
}

/** Whether a node at this position never draws: a kind `requiredOwner` names
 * anywhere below the root, or — once the walk is inside a sub-template, whose
 * data scope nothing below clears — a kind a `cell` refuses (`refusedOwner`: a
 * table, `table_in_cell`). Outside a sub-template a wrapped table DOES draw, so
 * it is left to the target-dependent `refuses`. */
function deadHere(type: unknown, scoped: boolean): boolean {
  return requiredOwner(type) !== null || (scoped && refusedOwner(type) !== null);
}

function nestedNeverDraws(
  value: unknown,
  depth: number,
  scoped: boolean,
  budget: { nodes: number },
): boolean {
  for (const [child, inSub] of childrenOf(value, budget)) {
    budget.nodes -= 1;
    // `>=`, not the refusal's `>`: this frame's `depth` is the PARENT's, so
    // the deepest level inspected is 24 in both walks.
    if (depth >= MAX_WALK_DEPTH || budget.nodes < 0) {
      return false;
    }
    const childScoped = scoped || inSub;
    if (deadHere(ownObject(child, 'type'), childScoped)) {
      return true;
    }
    if (nestedNeverDraws(child, depth + 1, childScoped, budget)) {
      return true;
    }
  }
  return false;
}

/** Whether this block holds an item that draws under NO insert target. Two
 * shapes, both skipped by the engine wherever the block lands:
 *
 * - a kind that lays out only DIRECTLY in one owner (`requiredOwner`: a page
 *   number in a band; a repeat, repeat_flow or page break in the flow body)
 *   anywhere below the root, whose owner there is the block's own container or
 *   one of its sub-templates — never a band or the flow body;
 * - a table anywhere inside the block's OWN `cell:` / `item:` /
 *   `columns[].cell` (`table_in_cell`) — the case `blockRefusedOwner` leaves
 *   out, because no target fixes it.
 *
 * The rest of the block still draws — a wrapping container as an empty frame
 * where the item should be. So this is the mirror of `blockRefusedOwner`'s
 * scope, for the mirror of its reason: that walk stays out of the
 * sub-templates because an item dead wherever it lands is no argument for
 * refusing a target; this one goes INTO them for exactly that reason. The ROOT
 * is never flagged — a bare restricted kind draws in its one owner, which is
 * the target-dependent `requires` — and neither is a table outside a
 * sub-template, which draws everywhere but a cell target (`refuses`).
 *
 * The refusal's caps (depth 24, 256 nodes, the deepest level inspected being 24
 * in both), over the same untrusted host storage: past either it answers
 * `false`, which is what the row said before this walk existed. */
export function blockNeverDraws(value: unknown): boolean {
  return nestedNeverDraws(value, 0, false, { nodes: MAX_WALK_NODES });
}
