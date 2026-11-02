// One declaration of a list's 「差し込みの設定」: its `{name}` (read-only —
// renaming would have to rewrite the per-entry text), how many times that
// text uses it, the declaration's own fields drawn from the catalog, and a
// delete behind an inline confirm that says what the text reads afterwards.
// Every field edit is one op at `bindings.<name>`; the delete removes the
// whole entry.

import type { CatalogField, Op } from '@shojiku/designer-core';
import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { BTN_SM } from '../ui/chrome';
import type { Declaration } from './bindingsModel';
import { fieldEditOp } from './schema/fieldEdit';
import { SchemaFields } from './schema/SchemaFields';
import type { SchemaContext } from './schema/widgetTypes';

export interface BindingCardProps {
  /** The list's structural path. */
  readonly path: string;
  readonly declaration: Declaration;
  /** How many times the per-entry text writes `{name}`. */
  readonly uses: number;
  /** The declaration's fields the engine can read, in catalog order. */
  readonly fields: readonly CatalogField[];
  readonly context: SchemaContext;
  readonly onApply: (op: Op) => void;
  readonly onDelete: () => void;
}

/** What the text reads once the declaration is gone: nothing changes for an
 * unused name; a declaration reading the document leaves the text reading the
 * entry's field of that NAME; a name that is its own key keeps reading that
 * key, with the data item's own format and placeholder; any other name reads
 * the entry's field of that NAME, which may not exist. */
function DeleteConfirm({
  declaration,
  uses,
  onConfirm,
  onCancel,
}: {
  readonly declaration: Declaration;
  readonly uses: number;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const { t } = useI18n();
  const { name, key, values } = declaration;
  const args = { name, key, n: uses, wire: `{${name}}` };
  const arm =
    uses === 0
      ? 'unused'
      : values?.scope === 'document'
        ? 'document'
        : key === name
          ? 'same'
          : 'other';
  return (
    <div className="mt-1 flex flex-col gap-1">
      <p className="m-0 text-sm">
        {t('panel.bindings.deleteConfirm.title', { name })}{' '}
        {t(`panel.bindings.deleteConfirm.${arm}`, args)}
      </p>
      <div className="flex gap-1">
        <button type="button" className={BTN_SM} onClick={onConfirm}>
          {t('panel.bindings.delete')}
        </button>
        <button type="button" className={BTN_SM} onClick={onCancel}>
          {t('panel.bindings.cancel')}
        </button>
      </div>
    </div>
  );
}

export function BindingCard({
  path,
  declaration,
  uses,
  fields,
  context,
  onApply,
  onDelete,
}: BindingCardProps) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const { name, values } = declaration;
  return (
    <li className="mb-2 rounded-sj border border-border border-solid p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm text-text">{`{${name}}`}</span>
        <button type="button" className={BTN_SM} onClick={() => setConfirming(true)}>
          {t('panel.bindings.delete')}
        </button>
      </div>
      {uses === 0 ? (
        <div className="mt-1 mb-2">
          <span className="rounded-sj bg-warn-bg px-1.5 py-0.5 text-xs text-warn-text">
            {t('panel.bindings.unused')}
          </span>
          <p className="m-0 mt-1 text-xs text-muted">{t('panel.bindings.unusedNote')}</p>
        </div>
      ) : (
        <p className="m-0 mt-1 mb-2 text-xs text-muted">{t('panel.bindings.uses', { n: uses })}</p>
      )}
      {values === undefined ? null : (
        <SchemaFields
          fields={fields}
          values={values}
          context={context}
          onEdit={(edit) => onApply(fieldEditOp(path, ['bindings', name], edit))}
        />
      )}
      {confirming ? (
        <DeleteConfirm
          declaration={declaration}
          uses={uses}
          onConfirm={onDelete}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </li>
  );
}
