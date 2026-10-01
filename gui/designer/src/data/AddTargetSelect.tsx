// The add form's 追加先 select: the top level (「どのグループにも入れない」), every
// group, and every table's rows — each named as a breadcrumb from the top
// (`取引先 › 住所`, `注文行 の各行 › tags の各行`), so two same-labelled groups in
// different places read apart.

import { useI18n } from '../i18n/context';
import { Field } from '../panel/fields';
import { INPUT } from '../ui/chrome';
import type { DefsNode } from './defsTree';
import { ancestry, nodeLabel } from './treeModel';

function targetLabel(t: ReturnType<typeof useI18n>['t'], tree: DefsNode, node: DefsNode): string {
  if (node.kind === 'root') {
    return t('data.add.targetRoot');
  }
  return ancestry(tree, node)
    .map((step) =>
      step.kind === 'table'
        ? t('data.add.targetRows', { label: nodeLabel(step) })
        : nodeLabel(step),
    )
    .join(' › ');
}

export function AddTargetSelect({
  tree,
  targets,
  value,
  onChange,
}: {
  readonly tree: DefsNode;
  readonly targets: readonly DefsNode[];
  readonly value: string;
  readonly onChange: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <Field label={t('data.add.target')}>
      <select
        className={INPUT}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {targets.map((node) => (
          <option key={node.id} value={node.id}>
            {targetLabel(t, tree, node)}
          </option>
        ))}
      </select>
    </Field>
  );
}
