// Named binding declarations (`bindings:`) as the chip editor READS them: the
// item-local map giving an interpolation NAME the full option set a bare
// `{key}` cannot carry — a params key outside the interpolation charset, and
// the `scope: document` escape out of a row scope
// (docs/engine/data-binding.md § Named binding declarations).
//
// This module is the narrowing/reading half; minting a name and planning an
// insertion live in `text/declMint`, and what a commit writes in
// `text/declCommit`. Two rules shape all three. **Minimal wire**: a declaration
// is authored only when the bare grammar cannot say it, so every template the
// GUI already produces is byte-unchanged. **One parser**: whether a name can be
// written as `{name}` is decided by round-tripping it through `chipWire` — the
// engine's `[A-Za-z0-9_.]` charset is never restated here, so the two cannot
// drift.
//
// Declaration names and params keys are untrusted strings (`__proto__` is a
// legal YAML key), so every lookup goes through a real `Map`/`Set` or
// `Object.entries`, never a plain-object table.

import type { ReadFn } from '@shojiku/designer-core';
import { type ChipMeta, type ChipOptionRow, chipMetaMap } from './chipModel';
import { interpolationKeys } from './interpolate';

/** One item-local declaration as the GUI reads and writes it. The engine also
 * allows `format`/`placeholder` there; the GUI never authors them (YAML stays
 * the expert path) and never rewrites a declaration it did not mint, so a
 * hand-authored one is carried through untouched. */
export interface Declaration {
  readonly key: string;
  /** `document` = the escape out of a row scope; `null` = the ambient scope
   * (the engine's default, which never serializes). */
  readonly scope: 'document' | null;
}

/** A declaration staged by a chip insertion, applied with the text at commit
 * so a cancelled edit leaves no orphan behind. */
export interface PendingDecl extends Declaration {
  readonly name: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Narrow an item's raw `bindings:` value to the declarations the GUI acts on.
 * Untrusted input degrades rather than throws: a non-map, a non-record entry
 * and a missing/empty/non-string `key` are dropped, and a garbage `scope`
 * reads as the ambient one (the engine's own default).
 *
 * Deliberately UNCAPPED, unlike the palette's display lists: the count is
 * already bounded by the template's own size cap, every consumer here is one
 * linear pass, and nothing per-declaration reaches the DOM — while a cap would
 * hide names from the taken set, letting a minted one COLLIDE with a real
 * declaration and silently redirect a chip. */
export function narrowDeclarations(value: unknown): ReadonlyMap<string, Declaration> {
  const out = new Map<string, Declaration>();
  const map = record(value);
  if (map === undefined) {
    return out;
  }
  for (const [name, raw] of Object.entries(map)) {
    const decl = record(raw);
    if (decl === undefined) {
      continue;
    }
    const key = decl.key;
    if (typeof key !== 'string' || key === '') {
      continue;
    }
    out.set(name, { key, scope: decl.scope === 'document' ? 'document' : null });
  }
  return out;
}

/** The materialized item at `path`, or `undefined` when it cannot be read (a
 * hostile or mid-edit document) — every caller degrades rather than throws. */
export function readItem(read: ReadFn, path: string): Record<string, unknown> | undefined {
  try {
    return record(read(path));
  } catch {
    return undefined;
  }
}

/** The declarations the item at `path` already carries. */
export function readDeclarations(read: ReadFn, path: string): ReadonlyMap<string, Declaration> {
  return narrowDeclarations(readItem(read, path)?.bindings);
}

function collectNames(out: Set<string>, value: unknown): void {
  if (typeof value === 'string') {
    for (const name of interpolationKeys(value)) {
      out.add(name);
    }
  }
}

/** The interpolation names an item references OUTSIDE its own `text:` — its
 * `link.url` and its spans' `text:`/`link.url`, the surfaces the engine
 * resolves through the SAME declaration map (`validate/bindings/decl.rs`).
 * The edited `text:` is deliberately absent: the commit compares that surface
 * directly, so a name only these others still use survives the prune. */
export function otherSurfaceNames(item: unknown): ReadonlySet<string> {
  const out = new Set<string>();
  const map = record(item);
  if (map === undefined) {
    return out;
  }
  collectNames(out, record(map.link)?.url);
  if (Array.isArray(map.spans)) {
    for (const entry of map.spans) {
      const span = record(entry);
      if (span === undefined) {
        continue;
      }
      collectNames(out, span.text);
      collectNames(out, record(span.link)?.url);
    }
  }
  return out;
}

/** [`otherSurfaceNames`] for the item at `path`. */
export function readOtherSurfaceNames(read: ReadFn, path: string): ReadonlySet<string> {
  return otherSurfaceNames(readItem(read, path));
}

/** The chip label/sample table for one item: the ambient rows keyed by their
 * own key, PLUS one entry per declared name resolved through its declaration.
 * A declaration WINS over an ambient field of the same name (the engine's
 * `binding_shadows_key` rule reports exactly that redirection), and a
 * declaration pointing at no offered field still shows its KEY — the bare
 * alias would hide which data the chip stands for. */
export function chipMetaFor(
  options: readonly ChipOptionRow[],
  documentOptions: readonly ChipOptionRow[],
  declared: ReadonlyMap<string, Declaration>,
): ReadonlyMap<string, ChipMeta> {
  const ambient = chipMetaMap(options);
  const atDocument = chipMetaMap(documentOptions);
  const out = new Map(ambient);
  for (const [name, decl] of declared) {
    const source = decl.scope === 'document' ? atDocument : ambient;
    out.set(name, source.get(decl.key) ?? { label: decl.key, sample: '' });
  }
  return out;
}
