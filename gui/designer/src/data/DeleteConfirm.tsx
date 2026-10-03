// The two-step delete confirmation under the detail header, for a node this
// template uses or whose definitions file is project-scoped (an unused node in
// an unshared file is deleted at once — `NodeHeader`). It names the places that
// use the node, says what happens to them (they stay, and read as undefined in
// 診断 — the template is never edited by a delete), that every sample variant
// loses the value, and how to undo; a shared file adds that the project's other
// templates cannot be checked from here.

import { useI18n } from '../i18n/context';
import { BTN_SM } from '../ui/chrome';
import type { DefsNode } from './defsTree';
import type { RestructureActions } from './detailContext';
import { placeCount } from './refs/match';
import type { DataRef } from './refs/types';
import { flattenTree, nodeLabel } from './treeModel';
import { UsageList } from './UsageList';

export interface DeleteConfirmProps {
  readonly node: DefsNode;
  readonly refs: readonly DataRef[];
  readonly actions: RestructureActions;
  readonly onClose: () => void;
}

export function DeleteConfirm({ node, refs, actions, onClose }: DeleteConfirmProps) {
  const { t } = useI18n();
  const label = nodeLabel(node);
  const inside = flattenTree(node).length - 1;
  const count = placeCount(refs);
  return (
    <section
      aria-label={t('data.delete.open')}
      className="flex flex-col gap-1.5 rounded-md bg-error-bg px-3 py-2 text-sm text-error-text"
    >
      <b>
        {inside > 0
          ? t('data.delete.titleInside', { label, count: inside })
          : t('data.delete.title', { label })}
      </b>
      {count > 0 ? (
        <>
          <span>{t('data.delete.used', { count })}</span>
          <UsageList refs={refs} />
          <span>{t('data.delete.outcome')}</span>
        </>
      ) : null}
      {actions.projectScoped ? <span>{t('data.delete.shared')}</span> : null}
      {actions.sampleReadOnly ? (
        <span>{t('data.delete.samplesUntouched', { undo: t('data.undo') })}</span>
      ) : (
        <span>{t('data.delete.samples', { label, undo: t('data.undo') })}</span>
      )}
      <div className="flex gap-1">
        <button
          type="button"
          className="cursor-pointer rounded-md border border-error-text bg-error-text px-2 py-1 text-surface"
          onClick={() => {
            actions.remove(node);
            onClose();
          }}
        >
          {t('data.delete.confirm', { label })}
        </button>
        <button type="button" className={BTN_SM} onClick={onClose}>
          {t('data.add.cancel')}
        </button>
      </div>
    </section>
  );
}
