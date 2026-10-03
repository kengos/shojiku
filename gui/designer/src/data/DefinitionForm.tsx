// The DEFINITION half of the data-item editor's right pane for a FIELD: its
// label, type, format, required flag and description.
//
// Every control is read-only (not hidden) when the host did not arm definition
// editing, so a viewer still sees what the engineer declared. Each input is
// uncontrolled + commit-on-blur and keyed by its own value, and each op builder
// returns null when nothing changed — a mere tab-through authors nothing.

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import { Field } from '../panel/fields';
import { INPUT, SECTION_TITLE } from '../ui/chrome';
import { type DefinitionField, descriptionOp, titleOp } from './definitionsEdit';
import type { DefsNode } from './defsTree';
import { RequiredToggle } from './RequiredToggle';
import { TypeFields } from './TypeFields';

export interface DefinitionFormProps {
  readonly node: DefsNode;
  /** The container holding the field — the required hint names it. */
  readonly parent: DefsNode | null;
  readonly def: DefinitionField;
  readonly editable: boolean;
  readonly onDefEdit: (op: Op | null) => void;
}

export function DefinitionForm({ node, parent, def, editable, onDefEdit }: DefinitionFormProps) {
  const { t } = useI18n();
  const keysPath = node.keysPath;
  return (
    <section className="flex flex-col gap-3">
      <h3 className={SECTION_TITLE}>{t('data.definition')}</h3>
      <Field label={t('data.field.label')}>
        <input
          key={def.title}
          type="text"
          className={INPUT}
          defaultValue={def.title}
          readOnly={!editable}
          onBlur={(event) => onDefEdit(titleOp(keysPath, def.title, event.currentTarget.value))}
        />
      </Field>
      <TypeFields keysPath={keysPath} def={def} editable={editable} onDefEdit={onDefEdit} />
      <RequiredToggle node={node} parent={parent} editable={editable} onDefEdit={onDefEdit} />
      <Field label={t('data.field.description')}>
        <textarea
          key={def.description}
          className={`${INPUT} min-h-[4rem] resize-y`}
          defaultValue={def.description}
          readOnly={!editable}
          onBlur={(event) =>
            onDefEdit(descriptionOp(keysPath, def.description, event.currentTarget.value))
          }
        />
      </Field>
    </section>
  );
}
