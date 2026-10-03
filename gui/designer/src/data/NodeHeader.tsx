// The detail pane's header for one node: its label, kind and OWN data name,
// where this template uses it (the usage chip, which opens the usage list), and
// — when the definitions are editable — 「データ名を変更」 and 「削除」, each
// opening its confirmation under the header.
//
// The header is keyed by the node (see `DetailPane`), so an open list or an
// open rename never carries over to the next selection.

import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { BTN_SM } from '../ui/chrome';
import { IconChevronDown } from '../ui/icons';
import { DeleteConfirm } from './DeleteConfirm';
import type { DefsNode } from './defsTree';
import type { DetailContext, RestructureActions } from './detailContext';
import { RenameForm } from './RenameForm';
import { placeCount, refsUnder } from './refs/match';
import { nodeLabel } from './treeModel';
import { UsageList } from './UsageList';

type Mode = 'none' | 'usage' | 'rename' | 'delete';

export function NodeHeader({
  node,
  ctx,
}: {
  readonly node: DefsNode;
  readonly ctx: DetailContext;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('none');
  if (node.kind === 'root') {
    return (
      <h2 className="m-0 border-b border-border pb-3 text-lg font-semibold text-text">
        {t('data.root.title')}
      </h2>
    );
  }
  const refs = ctx.usage === null ? [] : refsUnder(ctx.usage.refs, node);
  const count = placeCount(refs);
  const actions = ctx.restructure;
  // A count from a walk that stopped at a bound is a floor, not the answer.
  const partial = ctx.usage?.truncated === true;
  const remove = (armed: RestructureActions) => {
    // Unused here, fully walked, and not shared: nothing to warn about, so the
    // delete happens at once and the rail says how to take it back.
    if (count === 0 && ctx.usage !== null && !partial && !armed.projectScoped) {
      armed.remove(node);
    } else {
      setMode('delete');
    }
  };
  const toggle = (next: Mode) => setMode((current) => (current === next ? 'none' : next));
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-3">
        <h2 className="m-0 text-lg font-semibold text-text [overflow-wrap:anywhere]">
          {nodeLabel(node)}
        </h2>
        {node.leaf === null ? (
          <span className="rounded-full border border-border px-2 text-sm text-muted">
            {t(`data.kind.${node.kind}`)}
          </span>
        ) : null}
        <span className="text-sm text-muted">
          {t('data.dataName')}: <code className="text-sm">{node.name}</code>
        </span>
        {count === 0 ? (
          <span className="text-sm text-muted">{t('data.usage.none')}</span>
        ) : (
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-sm text-accent"
            aria-expanded={mode === 'usage'}
            onClick={() => toggle('usage')}
          >
            <span className="underline underline-offset-2">{t('data.usage.count', { count })}</span>
            {/* The disclosure the tree rows use: one chevron, turned while closed. */}
            <IconChevronDown
              size={12}
              aria-hidden="true"
              data-collapsed={mode === 'usage' ? undefined : ''}
              className="transition-transform data-collapsed:-rotate-90"
            />
          </button>
        )}
        {partial ? <span className="text-sm text-muted">{t('data.usage.partial')}</span> : null}
        {actions === undefined ? null : (
          <span className="ml-auto flex gap-1">
            <button type="button" className={BTN_SM} onClick={() => toggle('rename')}>
              {t('data.rename.open')}
            </button>
            <button
              type="button"
              className={`${BTN_SM} text-error-text`}
              onClick={() => remove(actions)}
            >
              {t('data.delete.open')}
            </button>
          </span>
        )}
      </div>
      {mode === 'usage' ? (
        <section aria-label={t('data.usage.title')} className="flex flex-col gap-1">
          <h3 className="m-0 text-sm font-normal text-muted">{t('data.usage.title')}</h3>
          <UsageList refs={refs} />
          <p className="m-0 text-sm text-muted">{t('data.usage.coverage')}</p>
        </section>
      ) : null}
      {mode === 'rename' && actions !== undefined ? (
        <RenameForm node={node} refs={refs} actions={actions} onClose={() => setMode('none')} />
      ) : null}
      {mode === 'delete' && actions !== undefined ? (
        <DeleteConfirm node={node} refs={refs} actions={actions} onClose={() => setMode('none')} />
      ) : null}
    </>
  );
}
