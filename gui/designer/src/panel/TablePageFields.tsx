// The page half of the table's settings: what happens where a page ends, and
// the header groups above the column labels.
//
// The three page switches exist only for a table DIRECTLY in the flow body —
// anywhere else (a container, an absolute body, a band) the engine draws the
// table as one bounded block and ignores them (`table_pagination_key_ignored`),
// so the panel says that instead of offering switches that would do nothing.
// A document that authored them there anyway is the diagnostic's business, and
// its quick-fix removes them.

import { HelpHint } from '../help/HelpHint';
import { useI18n } from '../i18n/context';
import { insertTargetOwner } from '../insert/flowPlacement';
import { seqPosition } from '../tree/reorder';
import { BTN_SM, FIELD_LABEL } from '../ui/chrome';
import { readColumnsView } from './columnsModel';
import { readGroupsView } from './groupModel';
import { hasCapability } from './itemPanelProps';
import type { TableSettingsContext } from './TableSettingsSection';
import type { TableSettingsView } from './tableSettingsModel';
import {
  addHeaderGroupOp,
  flagToggleOp,
  type TableFlag,
  uncoveredColumns,
} from './tableSettingsOps';

/** Where the table at `path` sits: directly in the flow body (`flow`, where it
 * paginates), somewhere the engine draws it as one block (`bounded`), or `null`
 * when the panel cannot tell — a path that is no list entry, or a parent list
 * the read refuses (a hostile subtree). `insertTargetOwner` answers `container`
 * for that last case, which would make the note ASSERT a render fact the panel
 * never established, so it is asked only once the read has succeeded. */
function pageMode(
  read: TableSettingsContext['controller']['read'],
  path: string,
): 'flow' | 'bounded' | null {
  const pos = seqPosition(path);
  if (pos === null) {
    return null;
  }
  try {
    read(pos.parent);
  } catch {
    return null;
  }
  return insertTargetOwner(read, pos.parent) === 'flow' ? 'flow' : 'bounded';
}

function FlagBox(props: {
  readonly flag: TableFlag;
  readonly checked: boolean;
  readonly label: string;
  readonly context: TableSettingsContext;
}) {
  const { path, controller } = props.context;
  return (
    <label className="mb-1.5 flex items-center gap-1.5 text-sm text-text">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={() => controller.apply(flagToggleOp(path, props.flag, props.checked))}
      />
      {props.label}
    </label>
  );
}

export function TablePageFields({
  context,
  view,
}: {
  readonly context: TableSettingsContext;
  readonly view: TableSettingsView;
}) {
  const { t } = useI18n();
  const { path, controller, capabilities, onSelectPath } = context;
  const raw = controller.read(path);
  const groups = readGroupsView(raw) ?? [];
  const columnCount = (readColumnsView(raw) ?? []).length;
  const room = uncoveredColumns(groups, columnCount);
  const mode = pageMode(controller.read, path);
  return (
    <>
      <p className={`${FIELD_LABEL} mt-3 font-semibold text-text`}>
        {t('panel.tableSettings.pages')}
      </p>
      {mode === 'flow' ? (
        <>
          <FlagBox
            flag="autoPageBreak"
            checked={view.autoPageBreak}
            label={t('panel.tableSettings.autoPageBreak')}
            context={context}
          />
          <FlagBox
            flag="repeatHeader"
            checked={view.repeatHeader}
            label={t('panel.tableSettings.repeatHeader')}
            context={context}
          />
          {hasCapability(capabilities, 'table.keepTogether') ? (
            <span className="flex items-center gap-1.5">
              <FlagBox
                flag="keepTogether"
                checked={view.keepTogether}
                label={t('panel.tableSettings.keepTogether')}
                context={context}
              />
              <HelpHint
                label={t('help.keepTogether.title')}
                title={t('help.keepTogether.title')}
                body={t('help.keepTogether.body')}
              />
            </span>
          ) : null}
        </>
      ) : null}
      {mode === 'bounded' ? (
        <p className="mb-2 text-sm text-muted">{t('panel.tableSettings.boundedNote')}</p>
      ) : null}
      {hasCapability(capabilities, 'table.headerGroups') ? (
        <>
          <p className={`${FIELD_LABEL} mt-3 font-semibold text-text`}>
            {t('panel.tableSettings.headerGroups', { n: groups.length })}
          </p>
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
                columnCount === 0
                  ? 'panel.tableSettings.noColumns'
                  : 'panel.tableSettings.allGrouped',
              )}
            </p>
          ) : null}
        </>
      ) : null}
    </>
  );
}
