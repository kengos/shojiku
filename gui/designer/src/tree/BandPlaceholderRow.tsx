// The layer-tree row for a band the document does not have yet. It reads as
// the band it would be — the same words and the same mark as a real header /
// footer row — with its state on a second line, and pressing it creates the
// band and selects it.
//
// It is CHROME, not a document node: it never enters `TreeView.roots`, so it
// stays out of `visiblePaths`, the drag order, the breadcrumb chain and the
// "two movable items" test the drag hint is gated on. That is why it is its own
// component rather than a synthetic `TreeNode` — a fake node would be reachable
// by every one of those.

import type { Op, ReadFn } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import { activateBand, BAND_LABEL_KEYS, type BandName } from '../insert/bandCreate';
import { kindIcon } from './kindIcons';
import { SECTION_PREFIX } from './labels';
import { TREE_TOGGLE } from './TreeRow';

export interface BandPlaceholderRowProps {
  readonly band: BandName;
  /** The document read the create decision is made against. */
  readonly read: ReadFn;
  /** Dispatches the creation as the editor's transactional batch — ONE
   * `putValue`, so one undo step reverts the whole band. */
  readonly applyAll: (ops: readonly Op[]) => { readonly ok: boolean };
  readonly onSelect: (path: string) => void;
}

export function BandPlaceholderRow({ band, read, applyAll, onSelect }: BandPlaceholderRowProps) {
  const { t } = useI18n();
  const Icon = kindIcon(`${SECTION_PREFIX}${band}`);
  const activate = () => {
    activateBand(band, read, applyAll, onSelect);
  };
  return (
    <li>
      <div className="flex items-center rounded-md hover:bg-bg">
        {/* The same fixed gutter every row has, so the label lines up with the
            real sections above and below it. */}
        <span className={`${TREE_TOGGLE} cursor-default`} aria-hidden="true" />
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border border-border border-dashed bg-transparent p-1 text-left text-muted"
          onClick={activate}
        >
          <span className="inline-flex w-[1.2em] shrink-0 justify-center" aria-hidden="true">
            <Icon size={14} />
          </span>
          {/* Two lines, not one: the tree pane narrows to 180px, where the name
              and its state cannot share a row (the `data/ItemListRow` shape). */}
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-text">
              {t(BAND_LABEL_KEYS[band])}
            </span>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm">
              {t('tree.band.empty')}
            </span>
          </span>
        </button>
      </div>
    </li>
  );
}
