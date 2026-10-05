// The right pane of the data-item editor for ONE selected tree node: a header
// (its label, kind, data name, usage and the rename / delete actions —
// `NodeHeader`) over the part that node kind edits — a field's definition form,
// value rules (`FieldRules`), sample value(s) and generation example and its
// hints for other tools (`OtherToolsSection`), a
// container's form, or the root's.
//
// The pane holds no state: every uncontrolled input inside is keyed by its OWN
// value, and that is what reseeds them when the selection or the document
// changes — the pane is NOT keyed by the selection, so anything added here must
// carry the same value-key or it will go on showing the previous node's text.

import type { ReactNode } from 'react';
import { ContainerDetail } from './ContainerDetail';
import { DefinitionForm } from './DefinitionForm';
import { readDefinitionField } from './definitionsEdit';
import type { DefsNode } from './defsTree';
import type { DetailContext } from './detailContext';
import { ExampleField } from './ExampleField';
import { sampleKind } from './editorModel';
import { FieldRules } from './FieldRules';
import { NodeHeader } from './NodeHeader';
import { FieldOtherTools } from './OtherToolsSection';
import { RootDetail } from './RootDetail';
import { SampleSection } from './SampleSection';
import { parentOf } from './treeModel';
import { readValueRules } from './valueRules';

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
        <FieldRules key={node.id} keysPath={node.keysPath} def={def} ctx={ctx} />
        <SampleSection node={node} leaf={leaf} kind={sampleKind(def.type, def.format)} ctx={ctx} />
        <ExampleField
          key={`${node.id}:example`}
          keysPath={node.keysPath}
          type={def.type === '' ? 'string' : def.type}
          example={readValueRules(ctx.definitions, node.keysPath).example}
          editable={ctx.editable}
          onDefEdit={ctx.onDefEdit}
        />
        <FieldOtherTools
          key={`${node.id}:tools`}
          definitions={ctx.definitions}
          keysPath={node.keysPath}
          editable={ctx.editable}
          onDefEdit={ctx.onDefEdit}
        />
      </>
    );
  }
  return (
    <>
      {/* Keyed by the node: an open usage list or rename never carries over. */}
      <NodeHeader key={node.id} node={node} ctx={ctx} />
      {body}
    </>
  );
}
