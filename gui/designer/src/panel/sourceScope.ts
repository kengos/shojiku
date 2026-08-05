// The scope wiring a data-SOURCE picker takes: which array groups a table or
// an iterable may bind to, and the document-scope escape one nested inside a
// row scope needs. Shared by the table columns section and the non-table
// iterable source section.
//
// Inside a row scope there are TWO kinds of offer: the arrays the row itself
// carries (bound row-relatively, no escape — the engine models them under
// their joined dotted path) and the top-level ones, which resolve only if the
// binding escapes with `scope: document`.

import type { EditorController } from '../editor/useEditor';
import type { PaletteGroup } from '../palette/model';
import { bindingPickOps } from './model';
import { bindingScopeFor, type PickerOption, scopeAuthorable } from './pickerModel';

function option(group: PaletteGroup, key: string): PickerOption {
  return {
    key,
    label: group.label === '' ? group.id : group.label,
    type: '',
    sample: '',
    enumValues: [],
  };
}

/** The DOCUMENT-scope bindable sources: the top-level array groups, as picker
 * options (free entry stays for a key outside the schema). A row-carried
 * source is excluded — its key resolves only inside its own parent. */
export function sourceOptions(groups: readonly PaletteGroup[] | null): readonly PickerOption[] {
  return (groups ?? [])
    .filter((group) => group.isArray && group.rowScope === undefined)
    .map((group) => option(group, group.id));
}

/** The sources the enclosing row itself carries, keyed ROW-RELATIVELY —
 * which is how the engine reads them and how the picker must author them. */
export function rowSourceOptions(
  groups: readonly PaletteGroup[] | null,
  scope: string,
): readonly PickerOption[] {
  return (groups ?? [])
    .filter((group) => group.rowScope === scope)
    .map((group) => option(group, group.id.slice(scope.length + 1)));
}

/** The props a `data.key` picker takes for its scope handling. Both call
 * sites SPREAD the result, so this stays private to the module. */
interface ScopeProps {
  readonly options: readonly PickerOption[];
  readonly documentOptions?: readonly PickerOption[];
  readonly scope?: string;
  readonly onPick?: (key: string, documentScoped: boolean) => void;
}

/** The scope wiring a data-SOURCE picker needs when the iterable ITSELF sits
 * inside a row scope (a list nested in a table cell, a table inside a repeat
 * card). The row's OWN arrays stay element-scoped offers — that is the
 * ordinary nesting, and picking one authors a plain row-relative key. Every
 * TOP-LEVEL group, by contrast, resolves only if the binding escapes the row,
 * so those offers move into the document section (badged per row) and a pick
 * authors `scope: document` — the case that used to author a silently
 * element-scoped binding to a top-level array. At top level the picker stays
 * today's plain one. */
export function sourceScopeProps(
  controller: EditorController,
  path: string,
  sources: readonly PickerOption[],
  scope: string,
  capabilities: readonly string[] | undefined,
  groups: readonly PaletteGroup[] | null = null,
): ScopeProps {
  const enclosing = bindingScopeFor(controller.read, path);
  if (enclosing === null) {
    return { options: sources };
  }
  const armed = scopeAuthorable(capabilities);
  const rows = rowSourceOptions(groups, enclosing);
  return {
    options: armed ? rows : [...rows, ...sources],
    documentOptions: armed ? sources : undefined,
    scope,
    onPick: (key, documentScoped) =>
      controller.applyAll(bindingPickOps(controller.read, path, key, documentScoped)),
  };
}
