// The 「名前付きスタイル」 disclosure a table's styled part carries below its
// format controls — named after what it holds, the named-style checklist(s) of
// that part, which are rarer than the controls above it, so closed by default. Hosts: the header band, the body band
// (its rows and its even rows), one row-condition rule, one header group.
//
// A closed disclosure still SAYS when it holds authored values — the toggle
// names how many named styles are applied inside, all its lists together —
// because a style that is in
// effect behind a closed door is exactly the "why does it look like this?" a
// non-engineer cannot answer. The open state is Designer-local UI state and
// never reaches the template.

import { useId, useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { DisclosureToggle } from './DisclosureToggle';
import { StyleNamesPicker } from './StyleNamesPicker';

/** One checklist inside the disclosure: the wire slot it writes and what it
 * carries now. */
export interface StyleNamesList {
  /** Where the list lives under the host path (see `styleNamesOp`). */
  readonly keys: readonly string[];
  /** The authored names, in order. */
  readonly names: readonly string[];
  /** The legend, when the host shows two lists. */
  readonly label?: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The string names at `keys` under `node`, non-strings dropped — a hostile
 * document's list degrades to what can be shown. */
export function namesAt(node: unknown, keys: readonly string[]): readonly string[] {
  let current: unknown = node;
  for (const key of keys) {
    const map = record(current);
    current = map !== undefined && Object.hasOwn(map, key) ? map[key] : undefined;
  }
  return Array.isArray(current) ? current.filter((n): n is string => typeof n === 'string') : [];
}

export function AdvancedStyles({
  controller,
  path,
  lists,
}: {
  readonly controller: EditorController;
  /** The node the lists' `keys` are under (the table, a rule entry, a group). */
  readonly path: string;
  readonly lists: readonly StyleNamesList[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const count = lists.reduce((sum, list) => sum + list.names.length, 0);
  return (
    <div className="mt-2">
      <DisclosureToggle
        open={open}
        bodyId={bodyId}
        title={
          open || count === 0
            ? t('panel.styleNamesToggle.title')
            : t('panel.styleNamesToggle.count', { n: count })
        }
        onToggle={() => setOpen(!open)}
      />
      {open ? (
        <div id={bodyId} className="mt-1">
          {lists.map((list) => (
            <StyleNamesPicker
              key={list.keys.join('.')}
              controller={controller}
              path={path}
              keys={list.keys}
              label={list.label}
              styleNames={list.names}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
