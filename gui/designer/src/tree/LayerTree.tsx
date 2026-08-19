// The layer tree (document outline) panel: one row per addressable node, the
// same structural paths the canvas/diagnostics/palette select, with two-way
// selection sync (click a row → shared selection; select elsewhere → the row's
// ancestors expand and it scrolls into view).
//
// This file is the panel FRAME: the fixed whole-document root row, the
// collapse state, the incoming-selection reveal, and the empty/truncated
// states. One row is `TreeRow` (recursive), the drag-reorder gesture is
// `useRowReorder`, and the walking / slot math / op construction stay in the
// pure `model.ts`.

import type { Op, OpResult, ReadFn } from '@shojiku/designer-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/context';
import { IconDocument } from '../ui/icons';
import type { TreeView } from './model';
import { visiblePaths } from './rowDrop';
import { breadcrumbChain } from './selection';
import { TreeRow } from './TreeRow';
import { useRowReorder } from './useRowReorder';

export interface LayerTreeProps {
  /** The outline (memoized `buildTree` output); `null` shows the empty state. */
  readonly view: TreeView | null;
  readonly selection: string | null;
  readonly onSelect: (path: string) => void;
  /** Dispatches a drop as ONE transactional batch — the editor's `applyAll`.
   * A same-parent reorder is one `moveItem`; a cross-parent one adds the
   * `box` keys the crossing invalidates. */
  readonly applyAll: (ops: readonly Op[]) => OpResult;
  /** The document read the drop model classifies destinations over. */
  readonly read: ReadFn;
  /** Right-click on a row: open the context menu at the pointer (viewport px).
   * Absent = the browser's native menu (no override). */
  readonly onContextMenu?: (path: string, x: number, y: number) => void;
  /** Open the fullscreen document-settings view (the fixed whole-document root row).
   * The row is the whole-document node — active when nothing else is selected. */
  readonly onOpenDocument: () => void;
}

export function LayerTree({
  view,
  selection,
  onSelect,
  applyAll,
  read,
  onContextMenu,
  onOpenDocument,
}: LayerTreeProps) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const rowRefs = useRef(new Map<string, HTMLElement>());
  // The selection value already scrolled to — the reveal scrolls once per
  // selection change, not on every re-render of the selected row.
  const scrolledTo = useRef<string | null>(null);

  // Reveal a selection arriving from another surface: expand its ancestors
  // (the row's ref callback then scrolls it into view once it exists).
  useEffect(() => {
    if (selection === null) {
      return;
    }
    const ancestors = breadcrumbChain(view, selection)
      .slice(0, -1)
      .map((node) => node.path);
    setCollapsed((previous) => {
      if (!ancestors.some((path) => previous.has(path))) {
        return previous;
      }
      const next = new Set(previous);
      for (const path of ancestors) {
        next.delete(path);
      }
      return next;
    });
  }, [view, selection]);

  const toggle = useCallback((path: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Called AFTER the reveal effect above: this hook owns the Escape-cancel
  // effect, which ran after the reveal before the split too.
  // The rows the drag measures against: what the tree SHOWS, in its own
  // order, so a gap between a nested last child and the row after it can be
  // read as either parent.
  const order = useMemo(() => visiblePaths(view, collapsed), [view, collapsed]);
  const reorder = useRowReorder({ applyAll, read, onSelect, rowRefs, order });

  // The whole-document node: a FIXED header row above the outline (never part of
  // the draggable/collapsible tree, no indent), always present — including a
  // blank document, where it is the only reachable settings entry. Active when
  // nothing else is selected (the state the property panel used to leave
  // invisible). Not a tree row: no drag, no context menu, no toggle gutter.
  const isDocumentActive = selection === null;
  return (
    <section className="p-2" aria-label={t('sidebar.layers')}>
      <div
        className={`mb-1 flex items-center rounded-md ${
          isDocumentActive ? 'bg-bg outline outline-1 outline-accent' : ''
        }`}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-1 text-left font-semibold text-text"
          aria-current={isDocumentActive ? 'true' : undefined}
          onClick={onOpenDocument}
        >
          <span
            className="inline-flex w-[1.2em] shrink-0 justify-center text-muted"
            aria-hidden="true"
          >
            <IconDocument size={14} />
          </span>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
            {t('tree.documentRoot')}
          </span>
        </button>
      </div>
      {view === null || view.roots.length === 0 ? (
        <p className="mx-1 my-2 text-sm text-muted">{t('tree.empty')}</p>
      ) : (
        <>
          <ul className="m-0 list-none p-0">
            {view.roots.map((node) => (
              <TreeRow
                key={node.path}
                node={node}
                selection={selection}
                collapsed={collapsed}
                toggle={toggle}
                onSelect={onSelect}
                onContextMenu={onContextMenu}
                reorder={reorder}
                rowRefs={rowRefs}
                scrolledTo={scrolledTo}
              />
            ))}
          </ul>
          {view.truncated ? (
            <p className="mx-1 my-2 text-sm text-muted">{t('tree.truncated')}</p>
          ) : null}
        </>
      )}
    </section>
  );
}
