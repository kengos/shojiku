// The 必須 checkbox a field's and a container's definition form share: it puts the
// node's data name into (or takes it out of) its PARENT's `required` list — the
// root's, a group's, or a table row's — through `requiredOp`.
//
// The line under it says what required DOES, and that depends on the parent:
// the engine checks a group's `required` only when the group is in the data,
// and a table row's in each row there is — so inside one, the hint names it.

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import { requiredOp } from './definitionsEdit';
import type { DefsNode } from './defsTree';
import { nodeLabel } from './treeModel';

function hintOf(t: ReturnType<typeof useI18n>['t'], parent: DefsNode | null): string {
  if (parent === null || parent.kind === 'root') {
    return t('data.requiredHint');
  }
  const key = parent.kind === 'table' ? 'data.requiredHintRows' : 'data.requiredHintGroup';
  return t(key, { parent: nodeLabel(parent) });
}

export function RequiredToggle({
  node,
  parent,
  editable,
  onDefEdit,
}: {
  readonly node: DefsNode;
  /** The container holding `node` (`null` / the root = top level). */
  readonly parent: DefsNode | null;
  readonly editable: boolean;
  readonly onDefEdit: (op: Op | null) => void;
}) {
  const { t } = useI18n();
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm text-text">
        <input
          type="checkbox"
          checked={node.required}
          disabled={!editable}
          onChange={(event) => onDefEdit(requiredOp(node, event.currentTarget.checked))}
        />
        {t('data.required')}
      </label>
      <p className="m-0 text-sm text-muted">{hintOf(t, parent)}</p>
    </div>
  );
}
