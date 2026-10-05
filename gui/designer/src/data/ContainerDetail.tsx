// The right pane for a CONTAINER — an object group, a table or a list: its label,
// description and required flag, a table's 行数の範囲 or a list's 個数の範囲, a
// list's 「1 つ 1 つの値」 (its element schema), and (group / table) links to the
// items inside, which select them in the tree; a table's 「ほかのツール向けの情報」
// (what one row is called).
//
// Inputs are uncontrolled + commit-on-blur and keyed by their own value (the
// pane is not keyed by the selection), and each op builder returns null when
// nothing changed, so a tab-through authors nothing.

import { useI18n } from '../i18n/context';
import { Field } from '../panel/fields';
import { BTN_SM, INPUT, SECTION_TITLE } from '../ui/chrome';
import { descriptionOp, readDefinitionField, titleOp } from './definitionsEdit';
import type { DefsNode } from './defsTree';
import type { DetailContext } from './detailContext';
import { ListElementSection } from './ListElementSection';
import { TableOtherTools } from './OtherToolsSection';
import { RangeFields } from './RangeFields';
import { RequiredToggle } from './RequiredToggle';
import { nodeLabel, parentOf } from './treeModel';
import { readValueRules } from './valueRules';

export function ContainerDetail({
  node,
  ctx,
}: {
  readonly node: DefsNode;
  readonly ctx: DetailContext;
}) {
  const { t } = useI18n();
  const def = readDefinitionField(ctx.definitions, node.keysPath);
  return (
    <section className="flex flex-col gap-3">
      <h3 className={SECTION_TITLE}>{t('data.definition')}</h3>
      <Field label={t('data.field.label')}>
        <input
          key={def.title}
          type="text"
          className={INPUT}
          defaultValue={def.title}
          readOnly={!ctx.editable}
          onBlur={(event) =>
            ctx.onDefEdit(titleOp(node.keysPath, def.title, event.currentTarget.value))
          }
        />
      </Field>
      <Field label={t('data.field.description')}>
        <textarea
          key={def.description}
          className={`${INPUT} min-h-[4rem] resize-y`}
          defaultValue={def.description}
          readOnly={!ctx.editable}
          onBlur={(event) =>
            ctx.onDefEdit(descriptionOp(node.keysPath, def.description, event.currentTarget.value))
          }
        />
      </Field>
      <RequiredToggle
        node={node}
        parent={parentOf(ctx.tree, node)}
        editable={ctx.editable}
        onDefEdit={ctx.onDefEdit}
      />
      {node.kind === 'group' ? null : (
        <RangeFields
          key={node.id}
          kind={node.kind === 'table' ? 'rows' : 'count'}
          keysPath={node.keysPath}
          ranges={readValueRules(ctx.definitions, node.keysPath).ranges}
          editable={ctx.editable}
          onDefEdit={ctx.onDefEdit}
        />
      )}
      {node.kind === 'list' ? (
        <ListElementSection
          key={`${node.id}:items`}
          listPath={node.keysPath}
          definitions={ctx.definitions}
          editable={ctx.editable}
          onDefEdit={ctx.onDefEdit}
        />
      ) : null}
      {node.children.length > 0 ? (
        <div>
          <h3 className={SECTION_TITLE}>{t('data.children', { count: node.children.length })}</h3>
          <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
            {node.children.map((child) => (
              <li key={child.id}>
                <button type="button" className={BTN_SM} onClick={() => ctx.onSelect(child.id)}>
                  {nodeLabel(child)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {node.kind === 'table' ? (
        <TableOtherTools
          key={`${node.id}:tools`}
          definitions={ctx.definitions}
          keysPath={node.keysPath}
          editable={ctx.editable}
          onDefEdit={ctx.onDefEdit}
        />
      ) : null}
    </section>
  );
}
