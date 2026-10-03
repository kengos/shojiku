// The LEFT rail of the data-item editor: search, the add-an-item control, the
// definition-undo control, and the data-item tree with its used/unused chips.
//
// The search box owns its own state here — nothing outside the rail reads the
// query — and the undo control lives in this rail (not beside a selected node)
// so it is reachable with nothing selected AND on a mounted host, where the
// sample is read-only but the definitions stay editable.

import type { Op } from '@shojiku/designer-core';
import type { ReactNode } from 'react';
import { useId, useState } from 'react';
import { useI18n } from '../i18n/context';
import { BTN_SM, INPUT } from '../ui/chrome';
import { TipBubble } from '../ui/TipBubble';
import { AddItemForm } from './AddItemForm';
import type { DefsNode } from './defsTree';
import { ItemTree } from './ItemTree';
import type { DataRef } from './refs/types';
import { filterTree } from './treeModel';

export interface ItemListPaneProps {
  /** `null` = no definitions to show (nothing parses yet). */
  readonly tree: DefsNode | null;
  readonly usage: readonly DataRef[];
  /** What the last rail-level action did or why it could not (a delete, an
   * undo refused, the edit cap) — read out as a status. */
  readonly notice: string | null;
  readonly definitions: string;
  readonly selected: DefsNode | null;
  readonly onSelect: (id: string) => void;
  readonly edit: {
    readonly onDefinitionEdit?: (op: Op) => boolean;
    readonly canUndo: boolean;
    readonly onUndo?: () => void;
    /** What the undo would take back (a rename / delete), as its description. */
    readonly undoHint?: string;
  };
}

/** The tree as an add target when none parses yet: the empty root a blank-start
 * add writes into (the ownership hook's own minimal base). */
const EMPTY_ROOT: DefsNode = {
  id: '',
  keysPath: [],
  name: '',
  label: '',
  kind: 'root',
  type: 'object',
  required: false,
  requiredListPath: null,
  parentRequired: [],
  dataPath: [],
  scope: null,
  leaf: null,
  choices: false,
  children: [],
};

export function ItemListPane({
  tree,
  usage,
  notice,
  definitions,
  selected,
  onSelect,
  edit,
}: ItemListPaneProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const undoHintId = useId();
  // An empty dictionary still shows its root row — the file's own label,
  // description and version are editable before any item exists.
  let list: ReactNode;
  const shown = tree === null ? null : filterTree(tree, query);
  if (shown === null) {
    list = <p className="m-0 text-sm text-muted">{t('palette.empty')}</p>;
  } else if (shown.children.length === 0 && query.trim() !== '') {
    list = <p className="m-0 text-sm text-muted">{t('palette.noMatches')}</p>;
  } else {
    list = (
      <>
        <ItemTree
          root={shown}
          usage={usage}
          selectedId={selected?.id ?? null}
          forceOpen={query.trim() !== ''}
          onSelect={onSelect}
        />
        {shown.children.length === 0 ? (
          <p className="m-0 text-sm text-muted">{t('palette.empty')}</p>
        ) : null}
      </>
    );
  }
  return (
    <nav
      className="flex w-[300px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-border bg-chrome p-3"
      aria-label={t('data.listLabel')}
    >
      <input
        type="search"
        className={INPUT}
        aria-label={t('palette.search')}
        placeholder={t('palette.search')}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {edit.onDefinitionEdit !== undefined ? (
        <AddItemForm
          definitions={definitions}
          tree={tree ?? EMPTY_ROOT}
          selected={selected}
          onDefinitionEdit={edit.onDefinitionEdit}
          onAdded={onSelect}
        />
      ) : null}
      {edit.onUndo !== undefined ? (
        // The instant bubble (never native `title`) says what the next undo takes
        // back when it is a rename / delete; with an id it is also the
        // button's description and shows on keyboard focus.
        <span className="group/tip relative self-start">
          <button
            type="button"
            className={BTN_SM}
            disabled={!edit.canUndo}
            aria-describedby={edit.undoHint === undefined ? undefined : undoHintId}
            onClick={edit.onUndo}
          >
            {t('data.undo')}
          </button>
          {edit.undoHint === undefined ? null : <TipBubble id={undoHintId} text={edit.undoHint} />}
        </span>
      ) : null}
      {list}
      <p role="status" className="m-0 border-t border-border pt-2 text-sm text-muted empty:hidden">
        {notice}
      </p>
    </nav>
  );
}
