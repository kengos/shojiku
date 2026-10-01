// The add-a-data-item control in the editor's left rail: a button that opens a
// small form — where it goes (the root, a group, or a table's rows), its display
// label, its data name and its kind (four scalar types, group, table, list) — and
// dispatches ONE `addFieldPlan` putValue. Works on a mounted host too, where the
// sample data is read-only but the definitions are not.
//
// The form mounts on open, so its starting place is read from the selection at
// that moment (`defaultAddTarget`), and it unmounts — dropping the draft — on
// add or cancel.

import type { Op } from '@shojiku/designer-core';
import { useId, useState } from 'react';
import { useI18n } from '../i18n/context';
import { MAX_FIELD_NAME_CHARS } from '../insert/fieldModel';
import { Field } from '../panel/fields';
import { BTN_SM, FIELD_LABEL, INPUT } from '../ui/chrome';
import { IconPlus } from '../ui/icons';
import { AddTargetSelect } from './AddTargetSelect';
import { ADD_KINDS, type AddKind, addFieldPlan } from './defsPlan';
import type { DefsNode } from './defsTree';
import { KIND_OPTION_KEY, SELECTION_SEP } from './editorModel';
import { addTargets, defaultAddTarget } from './treeModel';

export interface AddItemFormProps {
  readonly definitions: string;
  readonly tree: DefsNode;
  readonly selected: DefsNode | null;
  readonly onDefinitionEdit: (op: Op) => void;
  /** The new item's selection id, so the editor can select it. */
  readonly onAdded: (id: string) => void;
}

function AddForm({
  definitions,
  tree,
  selected,
  onDefinitionEdit,
  onAdded,
  onClose,
}: AddItemFormProps & {
  readonly onClose: () => void;
}) {
  const { t } = useI18n();
  const targets = addTargets(tree);
  const [targetId, setTargetId] = useState(() => defaultAddTarget(tree, selected).id);
  const [label, setLabel] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AddKind>('string');
  const [refusal, setRefusal] = useState<string | null>(null);
  const nameId = useId();
  const hintId = useId();
  const target = targets.find((node) => node.id === targetId) ?? tree;
  return (
    <form
      className="flex flex-col gap-1 rounded-md border border-border bg-bg p-2"
      aria-label={t('data.addItem')}
      onSubmit={(event) => {
        event.preventDefault();
        const plan = addFieldPlan(definitions, target, label, name, kind);
        if (!plan.ok) {
          setRefusal(`data.error.${plan.reason}`);
          return;
        }
        onDefinitionEdit(plan.op);
        onAdded(plan.keysPath.join(SELECTION_SEP));
        onClose();
      }}
    >
      <AddTargetSelect tree={tree} targets={targets} value={target.id} onChange={setTargetId} />
      <Field label={t('data.field.label')}>
        <input
          type="text"
          className={INPUT}
          value={label}
          onChange={(event) => setLabel(event.currentTarget.value)}
        />
      </Field>
      <div className="mb-2">
        <label htmlFor={nameId} className={FIELD_LABEL}>
          {t('data.dataName')}
        </label>
        <input
          id={nameId}
          type="text"
          className={`${INPUT} font-mono`}
          aria-describedby={hintId}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            // A Japanese user pressing Enter to confirm an IME conversion must
            // not submit the form mid-composition.
            if (event.key === 'Enter' && event.nativeEvent.isComposing) {
              event.preventDefault();
            }
          }}
        />
        <span id={hintId} className="text-sm text-muted">
          {t('data.add.nameHint')}
        </span>
      </div>
      <Field label={t('data.field.type')}>
        <select
          className={INPUT}
          value={kind}
          onChange={(event) => setKind(event.currentTarget.value as AddKind)}
        >
          {ADD_KINDS.map((option) => (
            <option key={option} value={option}>
              {t(KIND_OPTION_KEY[option])}
            </option>
          ))}
        </select>
      </Field>
      {refusal !== null ? (
        <output className="text-sm text-error-text">
          {t(refusal, { max: MAX_FIELD_NAME_CHARS })}
        </output>
      ) : null}
      <div className="flex gap-1">
        <button type="submit" className={BTN_SM} disabled={name.trim() === ''}>
          {t('data.add.submit')}
        </button>
        <button type="button" className={BTN_SM} onClick={onClose}>
          {t('data.add.cancel')}
        </button>
      </div>
    </form>
  );
}

/** The rail's add control: the opener button, or the open form. */
export function AddItemForm(props: AddItemFormProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (open) {
    return <AddForm {...props} onClose={() => setOpen(false)} />;
  }
  return (
    <button
      type="button"
      className={`${BTN_SM} inline-flex items-center gap-1 self-start`}
      onClick={() => setOpen(true)}
    >
      <IconPlus size={12} />
      {t('data.addItem')}
    </button>
  );
}
