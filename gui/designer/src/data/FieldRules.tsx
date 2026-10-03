// The value-rule sections of a FIELD's pane, between its definition form and its
// sample value: 選択肢 (`EnumSection`), 表示 (the blank-form placeholder) and the
// range its type reads — 値の範囲 for a number, 文字数の範囲 for text, none for a
// yes / no field. A range key of the OTHER kind left behind by a type change is
// inert (the engine reads a range only for its own base type) and stays as it is.
//
// The caller keys this by the node: the sections hold per-node state (an open
// draft, a refusal message) and the pane itself is not keyed by selection.

import { DisplaySection } from './DisplaySection';
import type { DefinitionField } from './definitionsEdit';
import type { DetailContext } from './detailContext';
import { EnumSection } from './EnumSection';
import { RangeFields } from './RangeFields';
import { readValueRules } from './valueRules';

export function FieldRules({
  keysPath,
  def,
  ctx,
}: {
  readonly keysPath: readonly string[];
  readonly def: DefinitionField;
  readonly ctx: DetailContext;
}) {
  const rules = readValueRules(ctx.definitions, keysPath);
  const type = def.type === '' ? 'string' : def.type;
  const edit = { keysPath, editable: ctx.editable, onDefEdit: ctx.onDefEdit };
  const numeric = type === 'number' || type === 'integer';
  return (
    <>
      <EnumSection {...edit} definitions={ctx.definitions} type={type} format={def.format} />
      <DisplaySection {...edit} placeholder={rules.placeholder} />
      {type === 'boolean' ? null : (
        <RangeFields {...edit} kind={numeric ? 'bound' : 'length'} ranges={rules.ranges} />
      )}
    </>
  );
}
