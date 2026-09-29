// The body of the table's 「Header groups」 section: one row per group — its
// label and how many columns it covers — which selects that group (whose own
// form, `GroupForm`, edits it), then the add button. The count is the RESOLVED
// coverage (`groupCoverage`, the engine's own accumulation), so a group an
// earlier one crowded out says it covers nothing rather than echoing its span.
//
// Removing a group lives on its own form; adding one lives here, because there
// is no group to select before the first exists.

import { useI18n } from '../i18n/context';
import { BTN_SM } from '../ui/chrome';
import { readColumnsView } from './columnsModel';
import { groupCoverage, readGroupsView } from './groupModel';
import type { TableSettingsContext } from './TableSettingsSection';
import { addHeaderGroupOp, uncoveredColumns } from './tableSettingsOps';

export function TableGroupList({ context }: { readonly context: TableSettingsContext }) {
  const { t } = useI18n();
  const { path, controller, onSelectPath } = context;
  const raw = controller.read(path);
  const groups = readGroupsView(raw) ?? [];
  const columnCount = (readColumnsView(raw) ?? []).length;
  const room = uncoveredColumns(groups, columnCount);
  return (
    <>
      {groups.length === 0 ? null : (
        <ul className="m-0 mb-2 flex list-none flex-col gap-1 p-0">
          {groups.map((group, index) => (
            // The wire is a sequence with no ids; the index is the group's path.
            // biome-ignore lint/suspicious/noArrayIndexKey: positional document rows
            <li key={index}>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-surface px-2 py-1 text-left text-sm text-text hover:border-muted"
                onClick={() => onSelectPath?.(`${path}.headerGroups[${index}]`)}
              >
                <span className="min-w-0 truncate">
                  {group.label === '' ? t('panel.tableSection.groups.unnamed') : group.label}
                </span>
                {/* A space between the two, so the button's accessible name reads
                    「Item 2 columns」 rather than running them together. */}{' '}
                <span className="shrink-0 text-muted text-xs">
                  {t('panel.tableSection.groups.span', {
                    n: groupCoverage(groups, columnCount, index)?.span ?? 0,
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className={BTN_SM}
        disabled={room <= 0}
        onClick={() => {
          const op = addHeaderGroupOp(
            path,
            groups,
            columnCount,
            t('panel.tableSettings.groupDefaultLabel'),
          );
          if (op !== null && controller.apply(op).ok) {
            onSelectPath?.(`${path}.headerGroups[${groups.length}]`);
          }
        }}
      >
        {t('panel.tableSettings.addGroup')}
      </button>
      {room <= 0 ? (
        <p className="mt-1 mb-0 text-sm text-muted">
          {t(
            columnCount === 0 ? 'panel.tableSettings.noColumns' : 'panel.tableSettings.allGrouped',
          )}
        </p>
      ) : null}
    </>
  );
}
