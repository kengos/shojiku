// The data-reference model: every place a template names a definitions data
// key, recorded at the LEAF that holds it, so one walk serves every reader — the
// usage counts (the palette's, the data-item editor's rows and header chip), the
// usage list a rename/delete confirmation shows, and the rename cascade that
// rewrites the references.
//
// The census is the engine's own validate walks (`engine/core/src/validate/` —
// bindings, cells, list entries, presence, tables, the document block) plus the
// two strings layout interpolates that validate does not check (a column's
// `label`, a header group's `label`), across ALL three bands — layout renders a
// header/footer table even though validate only walks the body.

/** Where in its owner a reference sits — what a usage list says ("the value",
 * "inside the text", "the row condition" …). */
export type Carrier =
  | 'value'
  | 'inline'
  | 'link'
  | 'visible'
  | 'mark'
  | 'ellipse'
  | 'checkbox'
  | 'source'
  | 'column'
  | 'rowCondition'
  | 'declaration'
  | 'label'
  | 'document';

/** The item (or the `document:` block) a reference belongs to — what a usage
 * list names and what the palette selects on the canvas. */
export interface RefOwner {
  /** Structural path of the item (`sections.body.items[2]`), or `document`. */
  readonly path: string;
  /** The item `type:` (`''` when absent), or `document`. */
  readonly type: string;
  /** The item's tree label (`null` when it has none). */
  readonly label: string | null;
}

/** What every reference carries. */
interface RefBase {
  readonly owner: RefOwner;
  /** A column / header group the reference sits in, named for the usage list. */
  readonly detail: string | null;
  /** Structural path of the MAP holding the leaf — an op's `path`. */
  readonly path: string;
  /** The drill from `path` to the leaf — an op's `keys`. */
  readonly keys: readonly string[];
  /** The data path the spelled key resolves under: `[]` at document scope, the
   * array's data path inside its rows / list entries (rows add no segment). */
  readonly frame: readonly string[];
  /** The key as written (dotted through objects). */
  readonly spelled: string;
  readonly carrier: Carrier;
  /** Whether the reference binds an array source (table / repeat / list `data`). */
  readonly source: boolean;
  /** The `bindings:` names declared on the owning item — a `{name}` among them
   * reads the declaration, never the data key (`inline` only). */
  readonly shadow: ReadonlySet<string>;
}

/** One reference to a data key. `whole`: the leaf IS the key. `inline`: a
 * `{key}` / `{key:format}` inside the leaf string (`text`). `strings`: a `{key}`
 * inside one element of a string-list leaf (`strings`) — the document's
 * keywords / authors. */
export type DataRef = RefBase &
  (
    | { readonly form: 'whole' }
    | { readonly form: 'inline'; readonly text: string }
    | { readonly form: 'strings'; readonly strings: readonly string[] }
  );

/** The walk's result. `truncated` = the walk stopped at a bound (depth, item
 * count, or a text holding more expressions than the parser reads) and did NOT
 * see every reference — a rename must then refuse rather than half-apply. */
export interface RefIndex {
  readonly refs: readonly DataRef[];
  readonly truncated: boolean;
}

/** Most items the walk visits before it stops (and reports `truncated`). */
export const MAX_REF_ITEMS = 4096;

/** The owner path of the `document:` block's references. */
export const DOCUMENT_OWNER = 'document';

export const NO_SHADOW: ReadonlySet<string> = new Set();
