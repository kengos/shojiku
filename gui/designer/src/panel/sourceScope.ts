// The scope wiring a data-SOURCE picker takes: which array groups a table or
// an iterable may bind to, and the document-scope escape one nested inside a
// row scope needs. Shared by the table columns section and the non-table
// iterable source section — both offer the SAME top-level array groups, so
// both face the same escape question.

import type { EditorController } from '../editor/useEditor';
import type { PaletteGroup } from '../palette/model';
import { bindingPickOps } from './model';
import { bindingScopeFor, type PickerOption, scopeAuthorable } from './pickerModel';

/** The table's bindable sources: the array groups, as picker options (free
 * entry stays for a key outside the schema). */
export function sourceOptions(groups: readonly PaletteGroup[] | null): readonly PickerOption[] {
  return (groups ?? [])
    .filter((group) => group.isArray)
    .map((group) => ({
      key: group.id,
      label: group.label === '' ? group.id : group.label,
      type: '',
      sample: '',
      enumValues: [],
    }));
}

/** The props a `data.key` picker takes for its scope handling. Both call
 * sites SPREAD the result, so this stays private to the module. */
interface ScopeProps {
  readonly options: readonly PickerOption[];
  readonly documentOptions?: readonly PickerOption[];
  readonly scope?: string;
  readonly onPick?: (key: string, documentScoped: boolean) => void;
}

const NO_OPTIONS: readonly PickerOption[] = [];

/** The scope wiring a data-SOURCE picker needs when the iterable ITSELF sits
 * inside a row scope (a list nested in a table cell, a table inside a repeat
 * card). Every offered array group is TOP-LEVEL, so picking one only resolves
 * if the binding escapes the row — the offers move into the document section
 * (badged per row) and a pick authors `scope: document`. That is exactly the
 * case that used to author a silently element-scoped binding to a top-level
 * array. At top level the picker stays today's plain one. */
export function sourceScopeProps(
  controller: EditorController,
  path: string,
  sources: readonly PickerOption[],
  scope: string,
  capabilities: readonly string[] | undefined,
): ScopeProps {
  if (bindingScopeFor(controller.read, path) === null) {
    return { options: sources };
  }
  const armed = scopeAuthorable(capabilities);
  return {
    options: armed ? NO_OPTIONS : sources,
    documentOptions: armed ? sources : undefined,
    scope,
    onPick: (key, documentScoped) =>
      controller.applyAll(bindingPickOps(controller.read, path, key, documentScoped)),
  };
}
