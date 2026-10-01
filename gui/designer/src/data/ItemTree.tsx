// The data-item tree in the editor's left rail: the 「データ全体の情報」 row (the
// definitions root) first, then every group, table, list and field, children
// indented under their container.
//
// Which containers are folded is panel-local VIEW state (a set of node ids), not
// document state: it never reaches an op. Everything starts open, a search
// shows every match open regardless, and a selection that MOVES (a jump, a
// freshly added item) opens its folded ancestors — a selected row is never
// left hidden inside a fold. Folding a container whose child is selected still
// works: nothing moved.

import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/context';
import type { UsageIndex } from '../palette/usage';
import type { DefsNode } from './defsTree';
import { SELECTION_SEP } from './editorModel';
import { ListRow } from './ItemListRow';
import { nodeUsage } from './treeModel';

export interface ItemTreeProps {
  readonly root: DefsNode;
  readonly usage: UsageIndex;
  readonly selectedId: string | null;
  /** Show every container open (a search is narrowing the tree). */
  readonly forceOpen: boolean;
  readonly onSelect: (id: string) => void;
}

export function ItemTree({ root, usage, selectedId, forceOpen, onSelect }: ItemTreeProps) {
  const { t } = useI18n();
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  // A node id is its keys path joined by SELECTION_SEP, so an ancestor's id is a
  // separator-bounded prefix of its descendant's.
  useEffect(() => {
    if (selectedId === null) {
      return;
    }
    setFolded((prev) => {
      const next = new Set(
        [...prev].filter((id) => !selectedId.startsWith(`${id}${SELECTION_SEP}`)),
      );
      return next.size === prev.size ? prev : next;
    });
  }, [selectedId]);
  const toggle = (id: string) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });

  const rows = (nodes: readonly DefsNode[], depth: number) =>
    nodes.map((node) => {
      const open = forceOpen || !folded.has(node.id);
      const bound = nodeUsage(usage, node);
      return (
        <li key={node.id}>
          <ListRow
            node={node}
            depth={depth}
            usedCount={bound === null ? null : bound.length}
            active={node.id === selectedId}
            expanded={node.children.length > 0 ? open : null}
            onToggle={() => toggle(node.id)}
            onSelect={() => onSelect(node.id)}
          />
          {open && node.children.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-px p-0">
              {rows(node.children, depth + 1)}
            </ul>
          ) : null}
        </li>
      );
    });

  return (
    <ul className="m-0 flex list-none flex-col gap-px p-0">
      <li>
        <button
          type="button"
          aria-current={root.id === selectedId}
          className={`w-full rounded-md border-0 px-2 py-1 pl-7 text-left font-semibold ${
            root.id === selectedId ? 'bg-bg' : 'bg-transparent hover:bg-bg'
          }`}
          onClick={() => onSelect(root.id)}
        >
          {t('data.root.title')}
        </button>
      </li>
      {rows(root.children, 0)}
    </ul>
  );
}
