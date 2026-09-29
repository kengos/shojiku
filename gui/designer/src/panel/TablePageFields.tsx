// The body of the table's 「When the table crosses a page」 section, and the
// `pageMode` answer that decides whether the section exists at all.
//
// The three page switches exist only for a table DIRECTLY in the flow body —
// anywhere else (a container, an absolute body, a band) the engine draws the
// table as one bounded block and ignores them (`table_pagination_key_ignored`),
// so the panel says that instead of offering switches that would do nothing.
// A document that authored them there anyway is the diagnostic's business, and
// its quick-fix removes them.

import { useI18n } from '../i18n/context';
import { insertTargetOwner } from '../insert/flowPlacement';
import { seqPosition } from '../tree/reorder';
import { hasCapability } from './itemPanelProps';
import type { TableSettingsContext } from './TableSettingsSection';
import type { TableSettingsView } from './tableSettingsModel';
import { flagToggleOp, type TableFlag } from './tableSettingsOps';

/** Where the table at `path` sits: directly in the flow body (`flow`, where it
 * paginates), somewhere the engine draws it as one block (`bounded`), or `null`
 * when the panel cannot tell — a path that is no list entry, or a parent list
 * the read refuses (a hostile subtree). `insertTargetOwner` answers `container`
 * for that last case, which would make the note ASSERT a render fact the panel
 * never established, so it is asked only once the read has succeeded. */
export function pageMode(
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

/** The 「When the table crosses a page」 section's body. The caller renders the
 * section only when `pageMode` answered, and passes that answer in. */
export function TablePageFields({
  context,
  view,
  mode,
}: {
  readonly context: TableSettingsContext;
  readonly view: TableSettingsView;
  readonly mode: 'flow' | 'bounded';
}) {
  const { t } = useI18n();
  if (mode === 'bounded') {
    return <p className="m-0 text-sm text-muted">{t('panel.tableSettings.boundedNote')}</p>;
  }
  return (
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
      {hasCapability(context.capabilities, 'table.keepTogether') ? (
        <FlagBox
          flag="keepTogether"
          checked={view.keepTogether}
          label={t('panel.tableSettings.keepTogether')}
          context={context}
        />
      ) : null}
    </>
  );
}
