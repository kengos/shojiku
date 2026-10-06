// What the id walk (`walk.ts`) yields: the HOLDERS — every node that carries,
// or could carry, an `id:` — and the REFS that name one, plus the walk's own
// running state. Types only; the walk decides what fills them.

/** A node that carries (or could carry) an `id:`. */
export interface IdHolder {
  readonly path: string;
  /** The authored id; `undefined` when absent or not a string. */
  readonly id: string | undefined;
  /** The wire type, or `column` / `cell_frame` / `card_frame`. */
  readonly kind: string;
  /** Content-derived label (the tree's), or `null` → show the kind's name. */
  readonly label: string | null;
  /** Inside a repeated scope — a repeat `cell`, a column `cell` or a
   * repeat_flow `item` frame, at any depth below it. Its placement repeats on
   * a page, so an anchor naming it resolves only to the first. */
  readonly repeated: boolean;
  /** The bound data key (`data.key`), the first choice for a minted name. */
  readonly dataKey: string | undefined;
  /** It carries an `id:` that is NOT a string — a value the engine rejects,
   * which the Designer shows as written and never overwrites. */
  readonly foreign: boolean;
  /** The region that DIRECTLY holds the item — a flow body, an absolute body,
   * a band — or `null` when an item or frame does (or for a column, a frame,
   * a copy's root). Some kinds place only directly in one of them. */
  readonly owner: Owner;
}

export type Owner = 'flow' | 'absolute' | 'band' | null;

/** A leaf naming an id: `keys` under the item at `path`. */
export interface IdRef {
  readonly path: string;
  readonly keys: readonly string[];
  readonly id: string;
}

export interface IdWalk {
  readonly holders: IdHolder[];
  readonly refs: IdRef[];
  nodes: number;
  truncated: boolean;
}
