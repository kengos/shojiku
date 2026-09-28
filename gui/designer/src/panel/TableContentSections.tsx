// A table's content tab, as collapsible sections — the shape of Google Docs'
// 「Table properties」 sidebar: columns (open at first), rows and cells, what
// happens when the table crosses a page, what an empty array draws, and the
// header groups. `ContentSection` routes a table here.
//
// A section whose every control is capability-gated off is not rendered, and
// neither is the page section when the panel cannot tell where the table sits
// (`pageMode` answers `null`): a note there would assert a render fact nobody
// established.

import { useI18n } from '../i18n/context';
import { readColumnsView } from './columnsModel';
import { readGroupsView } from './groupModel';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import { PanelSection } from './PanelSection';
import { TableColumnsSection } from './TableColumnsSection';
import { TableGroupList } from './TableGroupList';
import { pageMode, TablePageFields } from './TablePageFields';
import { TableEmptyBody, TableRowsBody } from './TableSettingsSection';
import {
  columnsSummary,
  controlHelp,
  emptySummary,
  groupsSummary,
  helpText,
  pagesSummary,
  rowsSummary,
} from './tableContentSummaries';
import { readTableSettings } from './tableSettingsModel';

export function TableContentSections(props: ItemPanelProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const { controller, path, view, capabilities } = props;
  const raw = controller.read(path);
  const settings = readTableSettings(raw);
  const context = { path, controller, capabilities, onSelectPath: props.onSelectPath };
  const mode = pageMode(controller.read, path);
  const has = (key: string) => hasCapability(capabilities, key);
  return (
    <>
      <PanelSection
        id="table.columns"
        title={t('panel.tableSection.columns.title')}
        summary={columnsSummary(i18n, (readColumnsView(raw) ?? []).length, view.dataKey)}
        help={helpText(
          t('panel.tableSection.columns.help'),
          props.onOpenColumnSheet === undefined
            ? ''
            : controlHelp(i18n, 'panel.columns.editSheet', 'panel.tableSection.columns.helpSheet'),
        )}
        defaultOpen
      >
        <TableColumnsSection
          controller={controller}
          tablePath={path}
          dataKey={view.dataKey}
          dataScope={view.dataScope}
          groups={props.paletteGroups}
          params={props.params}
          capabilities={capabilities}
          formatCatalog={props.formatCatalog}
          onOpenSheet={props.onOpenColumnSheet}
        />
      </PanelSection>
      <PanelSection
        id="table.rows"
        title={t('panel.tableSection.rows.title')}
        summary={rowsSummary(i18n, settings, has('table.row.height'))}
        help={helpText(
          has('table.row.height')
            ? controlHelp(
                i18n,
                'panel.tableSettings.rowHeight',
                'panel.tableSection.rows.helpRowHeight',
              )
            : '',
          has('table.row.height')
            ? controlHelp(
                i18n,
                'panel.tableSettings.headerHeight',
                'panel.tableSection.rows.helpHeaderHeight',
              )
            : '',
          controlHelp(
            i18n,
            'panel.tableSettings.cellPadding',
            'panel.tableSection.rows.helpPadding',
          ),
        )}
      >
        <TableRowsBody context={context} />
      </PanelSection>
      {mode === null ? null : (
        <PanelSection
          id="table.pages"
          title={t('panel.tableSection.pages.title')}
          summary={pagesSummary(i18n, settings, mode, has('table.keepTogether'))}
          help={helpText(
            t('panel.tableSection.pages.help'),
            mode === 'flow' && has('table.keepTogether')
              ? controlHelp(
                  i18n,
                  'panel.tableSettings.keepTogether',
                  'panel.tableSection.pages.helpKeep',
                )
              : '',
          )}
        >
          <TablePageFields context={context} view={settings} mode={mode} />
        </PanelSection>
      )}
      <PanelSection
        id="table.empty"
        title={t('panel.tableSection.empty.title')}
        summary={emptySummary(i18n, settings, has('table.mergeEmptyCells'))}
        help={helpText(
          controlHelp(i18n, 'panel.tableSettings.empty', 'panel.tableSection.empty.helpZero'),
          has('table.mergeEmptyCells')
            ? controlHelp(
                i18n,
                'panel.tableSettings.mergeEmptyCells',
                'panel.tableSection.empty.helpMerge',
              )
            : '',
        )}
      >
        <TableEmptyBody context={context} />
      </PanelSection>
      {has('table.headerGroups') ? (
        <PanelSection
          id="table.groups"
          title={t('panel.tableSection.groups.title')}
          summary={groupsSummary(i18n, readGroupsView(raw) ?? [])}
          help={t('panel.tableSection.groups.help')}
        >
          <TableGroupList context={context} />
        </PanelSection>
      ) : null}
    </>
  );
}
