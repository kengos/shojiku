// The LEFT rail of the data-item editor: search, the add-a-field form, the
// definition-undo control, the project-scope hint, and the grouped data-item
// list with its used/unused chips.
//
// The search box owns its own state here — nothing outside the rail reads the
// query — and the undo control lives in this rail (not beside a selected field)
// so it is reachable with nothing selected AND on a mounted host, where the
// sample is read-only but the definitions stay editable.

import type { Op } from '@shojiku/designer-core';
import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/context';
import { filterGroups } from '../palette/filter';
import type { PaletteField, PaletteGroup } from '../palette/model';
import { fieldUsage, type UsageIndex } from '../palette/usage';
import { BTN_SM, INPUT } from '../ui/chrome';
import { AddItemForm } from './AddItemForm';
import { selectionKey } from './editorModel';
import { ListRow } from './ItemListRow';

export interface ItemListPaneProps {
  readonly groups: readonly PaletteGroup[];
  readonly usage: UsageIndex;
  readonly definitions: string;
  readonly onDefinitionEdit?: (op: Op) => void;
  readonly canUndoDefinition: boolean;
  readonly onUndoDefinition?: () => void;
  readonly definitionsProjectScoped: boolean;
  readonly selectedField: PaletteField | null;
  readonly onSelect: (key: string) => void;
}

export function ItemListPane({
  groups,
  usage,
  definitions,
  onDefinitionEdit,
  canUndoDefinition,
  onUndoDefinition,
  definitionsProjectScoped,
  selectedField,
  onSelect,
}: ItemListPaneProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const shown = useMemo(() => filterGroups(groups, query), [groups, query]);
  return (
    <nav
      className="flex w-[300px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-border bg-chrome p-3"
      aria-label={t('data.editorTitle')}
    >
      <input
        type="search"
        className={INPUT}
        aria-label={t('palette.search')}
        placeholder={t('palette.search')}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {onDefinitionEdit !== undefined ? (
        <AddItemForm definitions={definitions} onDefinitionEdit={onDefinitionEdit} />
      ) : null}
      {onUndoDefinition !== undefined ? (
        <button
          type="button"
          className={`${BTN_SM} self-start`}
          disabled={!canUndoDefinition}
          onClick={onUndoDefinition}
        >
          {t('data.undo')}
        </button>
      ) : null}
      {/* On a mounted host the definitions document is PROJECT-scoped: a save
        changes what every template in the project validates against. Shown
        beside the definition-editing controls, before the save. */}
      {definitionsProjectScoped && onDefinitionEdit !== undefined ? (
        <p className="m-0 rounded-md border border-border bg-surface px-2 py-1 text-sm text-muted">
          {t('data.projectScopeHint')}
        </p>
      ) : null}
      {groups.length === 0 ? (
        <p className="m-0 text-sm text-muted">{t('palette.empty')}</p>
      ) : shown.length === 0 ? (
        <p className="m-0 text-sm text-muted">{t('palette.noMatches')}</p>
      ) : (
        shown.map((group) => (
          <section
            key={group.id}
            aria-label={group.label === '' ? t('palette.ungrouped') : group.label}
          >
            <h3 className="m-0 mb-1 flex items-center gap-2 text-sm font-semibold text-text">
              <span>{group.label === '' ? t('palette.ungrouped') : group.label}</span>
              {group.isArray ? (
                <span className="rounded-full border border-border px-2 text-sm font-normal text-muted">
                  {t('palette.array')}
                </span>
              ) : null}
            </h3>
            <ul className="m-0 flex list-none flex-col gap-px p-0">
              {group.fields.map((field) => (
                <ListRow
                  key={selectionKey(group.id, field.key)}
                  field={field}
                  usedCount={fieldUsage(usage, group, field.key).length}
                  active={selectedField === field}
                  onSelect={() => onSelect(selectionKey(group.id, field.key))}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </nav>
  );
}
