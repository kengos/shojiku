// The right pane of the data-item editor for ONE selected tree node: a header
// (its label, kind and data name) over the part that node kind edits — a field's
// definition form and sample value(s), a container's form, or the root's.
//
// The pane holds no state: every uncontrolled input inside is keyed by its OWN
// value, and that is what reseeds them when the selection or the document
// changes — the pane is NOT keyed by the selection, so anything added here must
// carry the same value-key or it will go on showing the previous node's text.

import type { ReactNode } from 'react';
import { useI18n } from '../i18n/context';
import { ContainerDetail } from './ContainerDetail';
import { DefinitionForm } from './DefinitionForm';
import { readDefinitionField } from './definitionsEdit';
import type { DefsNode } from './defsTree';
import type { DetailContext } from './detailContext';
import { sampleKind } from './editorModel';
import { RootDetail } from './RootDetail';
import { SampleSection } from './SampleSection';
import { nodeLabel, parentOf } from './treeModel';

function NodeHeader({ node }: { readonly node: DefsNode }) {
  const { t } = useI18n();
  if (node.kind === 'root') {
    return (
      <h2 className="m-0 border-b border-border pb-3 text-lg font-semibold text-text">
        {t('data.root.title')}
      </h2>
    );
  }
  return (
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
    </div>
  );
}

/** The right pane for one selected node. Stateless — the inputs inside reseed by
 * their own value keys. */
export function DetailPane({
  node,
  ctx,
}: {
  readonly node: DefsNode;
  readonly ctx: DetailContext;
}) {
  const leaf = node.leaf;
  let body: ReactNode;
  if (node.kind === 'root') {
    body = <RootDetail ctx={ctx} />;
  } else if (leaf === null) {
    body = <ContainerDetail node={node} ctx={ctx} />;
  } else {
    const def = readDefinitionField(ctx.definitions, node.keysPath);
    body = (
      <>
        <DefinitionForm
          node={node}
          parent={parentOf(ctx.tree, node)}
          def={def}
          editable={ctx.editable}
          onDefEdit={ctx.onDefEdit}
        />
        <SampleSection node={node} leaf={leaf} kind={sampleKind(def.type, def.format)} ctx={ctx} />
      </>
    );
  }
  return (
    <>
      <NodeHeader node={node} />
      {body}
    </>
  );
}
