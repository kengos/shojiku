// One row of the layer tree, rendering its own children recursively: the
// expand/collapse twisty, the decorative kind mark, the label, and the row's
// interaction surface (click to select, right-click menu, Alt+↑/↓ reorder,
// ArrowLeft/Right collapse). The reorder gesture and its drop indicator come
// from `useRowReorder`; the row only paints what that hook reports.

import type { KeyboardEvent, RefObject } from 'react';
import { useI18n } from '../i18n/context';
import { IconChevronDown } from '../ui/icons';
import { kindIcon } from './kindIcons';
import { nodeLabel } from './labels';
import type { TreeNode } from './model';
import type { RowReorder } from './useRowReorder';

/** The expand/collapse toggle (and its leaf placeholder) — a fixed-width gutter
 * before the row label. */
const TREE_TOGGLE =
  'inline-flex w-[18px] shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-sm text-muted';

export interface TreeRowProps {
  readonly node: TreeNode;
  readonly selection: string | null;
  readonly collapsed: ReadonlySet<string>;
  readonly toggle: (path: string) => void;
  readonly onSelect: (path: string) => void;
  /** Right-click on a row: open the context menu at the pointer (viewport px).
   * Absent = the browser's native menu (no override). */
  readonly onContextMenu: ((path: string, x: number, y: number) => void) | undefined;
  readonly reorder: RowReorder;
  /** The live row elements by path: registered here, measured by the reorder
   * hook, and read by the selection reveal below. */
  readonly rowRefs: RefObject<Map<string, HTMLElement>>;
  /** The selection value already scrolled to — the reveal scrolls once per
   * selection change, not on every re-render of the selected row. */
  readonly scrolledTo: RefObject<string | null>;
}

export function TreeRow({
  node,
  selection,
  collapsed,
  toggle,
  onSelect,
  onContextMenu,
  reorder,
  rowRefs,
  scrolledTo,
}: TreeRowProps) {
  const { t } = useI18n();
  const isCollapsed = collapsed.has(node.path);
  const isSelected = selection === node.path;
  const KindIcon = kindIcon(node.kind);
  const { dragging, dropBefore, dropAfter } = reorder.marksFor(node);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      reorder.onArrowMove(node, event);
      return;
    }
    if (event.key === 'ArrowLeft' && node.children.length > 0 && !isCollapsed) {
      event.preventDefault();
      toggle(node.path);
    } else if (event.key === 'ArrowRight' && node.children.length > 0 && isCollapsed) {
      event.preventDefault();
      toggle(node.path);
    }
  };

  return (
    <li>
      {/* The `--drop-*` marker classes are kept as test hooks; the accent line
          is a per-side border utility (the base border stays transparent). */}
      <div
        className={`flex items-center rounded-md border-y-2 hover:bg-bg ${
          dropBefore ? 'sj-tree-row--drop-before border-t-accent' : 'border-t-transparent'
        } ${dropAfter ? 'sj-tree-row--drop-after border-b-accent' : 'border-b-transparent'}${
          isSelected ? ' bg-bg outline outline-1 outline-accent' : ''
        }${dragging ? ' sj-tree-row--dragging opacity-50' : ''}`}
      >
        {node.children.length > 0 ? (
          <button
            type="button"
            className={TREE_TOGGLE}
            aria-expanded={!isCollapsed}
            aria-label={t(isCollapsed ? 'tree.expand' : 'tree.collapse')}
            onClick={() => toggle(node.path)}
          >
            {/* One chevron, rotated a quarter turn when collapsed (the
                shipped disclosure pattern). `data-collapsed` is the stable
                hook — tests assert the attribute, never the utility. */}
            <IconChevronDown
              size={12}
              data-collapsed={isCollapsed ? '' : undefined}
              className="transition-transform data-collapsed:-rotate-90"
            />
          </button>
        ) : (
          <span className={`${TREE_TOGGLE} cursor-default`} aria-hidden="true" />
        )}
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer touch-none items-center gap-2 border-0 bg-transparent p-1 text-left text-text"
          aria-current={isSelected ? 'true' : undefined}
          ref={(el) => {
            if (el === null) {
              rowRefs.current.delete(node.path);
              return;
            }
            rowRefs.current.set(node.path, el);
            // jsdom ships no scrollIntoView, hence the guarded call.
            if (node.path === selection && scrolledTo.current !== selection) {
              scrolledTo.current = selection;
              el.scrollIntoView?.({ block: 'nearest' });
            }
          }}
          onClick={reorder.onClick(node)}
          onContextMenu={
            onContextMenu === undefined
              ? undefined
              : (event) => {
                  event.preventDefault();
                  onSelect(node.path);
                  onContextMenu(node.path, event.clientX, event.clientY);
                }
          }
          onKeyDown={onKeyDown}
          onPointerDown={reorder.onPointerDown(node)}
          onPointerMove={reorder.onPointerMove}
          onPointerUp={reorder.onPointerUp}
          onPointerCancel={reorder.onPointerCancel}
        >
          <span
            className="inline-flex w-[1.2em] shrink-0 justify-center text-muted"
            aria-hidden="true"
          >
            <KindIcon size={14} />
          </span>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
            {nodeLabel(node, t)}
          </span>
          {node.conditional === true ? (
            // Whether this item draws depends on the data. Worth a mark
            // because a COLLAPSED one produces no box, so selecting its row
            // highlights nothing on canvas — which reads as a broken editor
            // unless the row says why.
            // Native `title` is banned by the chrome convention (its
            // OS-controlled delay reads as "no tooltip"), and a bare
            // `aria-label` is not allowed on a generic span — so the badge
            // shows a short token and carries its explanation as
            // screen-reader text.
            <span className="ml-1 shrink-0 rounded-sm border border-border px-1 text-[10px] text-muted">
              <span className="sr-only">{t('tree.conditional')}</span>
              <span aria-hidden="true">{t('tree.conditional.badge')}</span>
            </span>
          ) : null}
        </button>
      </div>
      {node.children.length > 0 && !isCollapsed ? (
        <ul className="m-0 list-none p-0 pl-3">
          {node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
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
      ) : null}
    </li>
  );
}
