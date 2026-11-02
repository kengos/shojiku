// 「差し込みの設定（{n}件）」: a list's `bindings:` declarations, in a closed
// disclosure of their own under the data-source section. The title counts the
// declarations (existence, like the named-styles toggle) open or closed. Each
// declaration is a card (`BindingCard`) whose fields are the catalog's entry
// fields the engine can read; the data key is picked from the list entry's
// fields and the format from what that key's type takes. Adding opens the
// form (`BindingAddForm`); every add, field edit and delete is one op. The open
// state is component state and never reaches the template.

import type { CatalogField, Op } from '@shojiku/designer-core';
import { useId, useState } from 'react';
import { useI18n } from '../i18n/context';
import { BTN_SM } from '../ui/chrome';
import { BindingAddForm } from './BindingAddForm';
import { BindingCard } from './BindingCard';
import { addDeclarationOp, deleteDeclarationOp, readDeclarations, usesOf } from './bindingsModel';
import { boundFormatRows } from './contentBound';
import { DisclosureToggle } from './DisclosureToggle';
import type { ItemPanelProps } from './itemPanelProps';
import { pickerOptions } from './pickerModel';

export interface BindingsDisclosureProps {
  readonly props: ItemPanelProps;
  /** The declaration's fields the engine can read. */
  readonly fields: readonly CatalogField[];
  /** The list's `bindings:` value as authored. */
  readonly bindings: unknown;
  /** The list's per-entry text, where the names are used. */
  readonly text: string;
}

export function BindingsDisclosure({ props, fields, bindings, text }: BindingsDisclosureProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const bodyId = useId();
  const { controller, path, view, capabilities } = props;
  const declarations = readDeclarations(bindings);
  const names = declarations.map((declaration) => declaration.name);
  const options = pickerOptions(props.paletteGroups, view.dataKey || null, props.params);
  const apply = (op: Op) => {
    controller.apply(op);
  };
  const title =
    declarations.length === 0
      ? t('panel.bindings.title')
      : t('panel.bindings.titleCount', { n: declarations.length });
  return (
    <div className="mt-2">
      <DisclosureToggle open={open} bodyId={bodyId} title={title} onToggle={() => setOpen(!open)} />
      {open ? (
        <div id={bodyId} className="mt-1">
          <p className="m-0 mb-2 text-xs text-muted">{t('panel.bindings.intro')}</p>
          <ul className="m-0 list-none p-0">
            {declarations.map((declaration) => (
              <BindingCard
                key={declaration.name}
                path={path}
                declaration={declaration}
                uses={usesOf(text, declaration.name)}
                fields={fields}
                context={{
                  unset: 'blank',
                  capabilities,
                  refs: {
                    dataKey: options,
                    format: boundFormatRows(props, options, declaration.key),
                  },
                }}
                onApply={apply}
                onDelete={() => apply(deleteDeclarationOp(path, declaration.name, names.length))}
              />
            ))}
          </ul>
          {adding ? (
            <BindingAddForm
              options={options}
              declared={names}
              onAdd={(name, key) => {
                apply(addDeclarationOp(path, name, key, bindings));
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button type="button" className={BTN_SM} onClick={() => setAdding(true)}>
              {t('panel.bindings.add')}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
