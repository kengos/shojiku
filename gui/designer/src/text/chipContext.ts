// The chip editor's per-item context, built through ONE helper both hosts (the
// property panel's content field and the canvas overlay) call, so the two chip
// surfaces cannot drift apart in which fields they offer or which chips they
// can label.
//
// It answers four things about the item being edited: which fields are
// offerable at its ambient scope, which are offerable at document scope (the
// second menu section a row-scoped item gets), which declarations it already
// carries, and whether the connected engine understands `bindings:` at all.

import type { ReadFn } from '@shojiku/designer-core';
import type { PaletteGroup } from '../palette/model';
import { bindingScopeFor, type PickerOption, pickerOptions } from '../panel/pickerModel';
import { type Declaration, readDeclarations, readOtherSurfaceNames } from './declModel';

export interface ChipContext {
  /** The rows offered at the item's own scope: row-relative inside an array
   * scope, document-scope otherwise. */
  readonly options: readonly PickerOption[];
  /** The document-scope rows. The SAME list as `options` at document scope —
   * the insert menu renders them as a second section only when `scope` is
   * non-null, and the chip labeller resolves a `scope: document` declaration
   * through them either way. */
  readonly documentOptions: readonly PickerOption[];
  /** The enclosing array scope key, `null` at document scope. */
  readonly scope: string | null;
  /** The declarations the item already carries (name → key + scope). */
  readonly declared: ReadonlyMap<string, Declaration>;
  /** Whether the engine understands `bindings:` — an older one parse-rejects
   * the key, so authoring a declaration against it would break the file. */
  readonly canDeclare: boolean;
  /** Names the item interpolates from its OTHER surfaces (its `link.url`, its
   * spans). One declaration map serves every surface of an item, so a minted
   * name must avoid these or that surface silently changes meaning. */
  readonly otherNames: readonly string[];
}

/** Build the context for the item at `path`. Reading is unconditional (a
 * declaration in an externally authored document labels its chip whatever the
 * engine supports — display honesty); only AUTHORING is capability-gated.
 * An absent capability list means the bundled engine, which has the key. */
export function chipContextFor(
  read: ReadFn,
  path: string,
  groups: readonly PaletteGroup[] | null,
  params: string,
  capabilities: readonly string[] | undefined,
): ChipContext {
  const scope = bindingScopeFor(read, path);
  const options = pickerOptions(groups, scope, params);
  return {
    options,
    documentOptions: scope === null ? options : pickerOptions(groups, null, params),
    scope,
    declared: readDeclarations(read, path),
    canDeclare: capabilities === undefined || capabilities.includes('binding.declarations'),
    otherNames: [...readOtherSurfaceNames(read, path)],
  };
}
