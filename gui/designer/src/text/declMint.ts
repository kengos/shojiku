// Minting a binding-declaration NAME and planning what one picked field
// inserts — the write-side counterpart of `text/declModel`'s reading.
//
// Minimal wire: a declaration is planned ONLY where the bare `{key}` grammar
// cannot say it (a key outside the interpolation charset, or the `scope:
// document` escape out of a row scope), so templates the GUI already produces
// stay byte-unchanged. One parser: whether a name is writable as `{name}` is
// decided by round-tripping it through `chipWire`, never by restating the
// engine's charset.
//
// Every name here is an untrusted string (`__proto__` is a legal YAML key), so
// the taken set is a real `Set` and declarations are walked as map entries.

import { chipWire } from './chipModel';
import type { Declaration, PendingDecl } from './declModel';
import { interpolationKeys } from './interpolate';

/** The stem a minted name falls back to when the key strips to nothing (a
 * fully non-ASCII key) or to something that cannot open a plain YAML key. */
const DEFAULT_STEM = 'f';

const DIGITS = '0123456789';

/** Keep only the characters an interpolation name may carry, decided by
 * round-tripping each one through the ONE segment parser — never a second
 * spelling of the engine's name charset. Iterates code points, so an astral
 * character drops whole. */
function stripToName(key: string): string {
  let out = '';
  for (const char of key) {
    if (chipWire(char) !== null) {
      out += char;
    }
  }
  return out;
}

/** Whether a stripped name may be used as-is: a name that begins with a digit
 * or a dot (`1`, `1.5`, `.inf`) reads as a non-string scalar once it becomes a
 * YAML map key, so a name we INVENT never starts with one. The engine's
 * charset still governs the rest of the name. */
function opensPlainKey(name: string): boolean {
  const first = name[0];
  return first !== undefined && first !== '.' && !DIGITS.includes(first);
}

/** A declaration name together with the exact wire slice referencing it. The
 * mint proves the round-trip, so no call site re-derives the grammar. */
export interface DeclName {
  readonly name: string;
  readonly wire: string;
}

/** The name a declaration for `key` gets: the key stripped to the name
 * charset when that spelling is free, else the stem carrying the smallest
 * free number.
 *
 * TOTAL — `taken` is finite, so `stem1 … stem{size+1}` cannot all be taken
 * (pigeonhole). That bounds the loop AND spares every caller a refusal path
 * that could never be reached in a running editor. */
export function mintDeclName(key: string, taken: ReadonlySet<string>): DeclName {
  const base = stripToName(key);
  const usable = opensPlainKey(base);
  if (usable && !taken.has(base)) {
    return { name: base, wire: `{${base}}` };
  }
  const stem = usable ? base : DEFAULT_STEM;
  let n = 1;
  while (taken.has(`${stem}${n}`)) {
    n += 1;
  }
  const name = `${stem}${n}`;
  return { name, wire: `{${name}}` };
}

/** The context a chip insertion is planned against. */
export interface InsertContext {
  /** The enclosing array scope key, `null` at document scope. */
  readonly scope: string | null;
  readonly declared: ReadonlyMap<string, Declaration>;
  readonly pending: readonly PendingDecl[];
  /** The editor's current wire text — the names it already uses are taken. */
  readonly text: string;
  /** Every field key the menu offers: a minted name must not shadow one, or
   * the engine reports `binding_shadows_key` against a name we invented. */
  readonly offeredKeys: readonly string[];
  /** Names the item's OTHER surfaces already interpolate (its `link.url`, its
   * spans). The engine resolves EVERY surface of an item through the one
   * declaration map, so minting a name one of them uses would silently
   * redirect that surface to this field. */
  readonly otherNames: readonly string[];
}

/** What one picked row inserts. */
export interface ChipInsert {
  /** The wire slice the chip stands for (`{key}` or `{name}`). */
  readonly wire: string;
  /** The interpolation name inside it — the chip's metadata lookup key. */
  readonly name: string;
  /** The declaration to stage until commit, `null` when the bare grammar
   * already says everything. */
  readonly decl: PendingDecl | null;
}

function takenNames(ctx: InsertContext): ReadonlySet<string> {
  const taken = new Set<string>(ctx.declared.keys());
  for (const decl of ctx.pending) {
    taken.add(decl.name);
  }
  for (const name of interpolationKeys(ctx.text)) {
    taken.add(name);
  }
  for (const key of ctx.offeredKeys) {
    taken.add(key);
  }
  for (const name of ctx.otherNames) {
    taken.add(name);
  }
  return taken;
}

/** A declaration that already means exactly this — picking the same field
 * twice is one declaration, not two. */
function reuseName(key: string, scope: 'document' | null, ctx: InsertContext): string | null {
  for (const [name, decl] of ctx.declared) {
    // An externally authored name may be unreferenceable (the engine's
    // `invalid_binding_name`); minting a fresh one is the repair.
    if (decl.key === key && decl.scope === scope && chipWire(name) !== null) {
      return name;
    }
  }
  for (const decl of ctx.pending) {
    if (decl.key === key && decl.scope === scope) {
      return decl.name;
    }
  }
  return null;
}

/** Plan the insertion of one picked field. `documentScoped` marks a row from
 * the menu's document-data section; outside a row scope the two scopes are
 * identical and the engine treats `document` as inert, so nothing is declared
 * for it there. */
export function planChipInsert(
  key: string,
  documentScoped: boolean,
  ctx: InsertContext,
): ChipInsert {
  const scope = documentScoped && ctx.scope !== null ? 'document' : null;
  const bare = chipWire(key);
  if (scope === null && bare !== null) {
    return { wire: bare, name: key, decl: null };
  }
  const reused = reuseName(key, scope, ctx);
  if (reused !== null) {
    return { wire: `{${reused}}`, name: reused, decl: null };
  }
  const minted = mintDeclName(key, takenNames(ctx));
  return { wire: minted.wire, name: minted.name, decl: { name: minted.name, key, scope } };
}
