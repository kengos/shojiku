// A table's decoration tab, as collapsible sections in the order the engine
// layers a table's look: the table style (open at first), the text every cell
// inherits (`TableTextSection`), the grid/frame border, the header row, the body rows, the conditional rules, and the named
// styles. `StyleSection` routes a table here; every other type keeps its flat
// decoration tab.
//
// A section whose every control is capability-gated off is not rendered at
// all — an empty section would be a heading that opens onto nothing.

import { useI18n } from '../i18n/context';
import { cascadeContext } from '../toolbar/cascade';
import { BorderEditor } from './BorderEditor';
import { readBorder } from './borderModel';
import { readRadius } from './borderRadius';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import { PanelSection } from './PanelSection';
import { TableConditionsSection } from './RowConditions';
import { StyleNamesPicker } from './StyleNamesPicker';
import { PanelColorField } from './StyleTabFields';
import { TableBandBody } from './TableBandBody';
import { bodyValignHost } from './TableBandFields';
import { IneffectiveFillBanner, TableStyleBody } from './TableStyleSection';
import { TableTextSection } from './TableTextSection';
import { controlHelp, helpText } from './tableContentSummaries';
import {
  bandSummary,
  borderSummary,
  borderWidthRaw,
  styleNamesSummary,
  styleSummary,
} from './tableDecorationSummaries';
import { bandStyleNames, gridWidthOf, readTableStyle } from './tableStyleModel';
import { HIDDEN_HEADER_CAPABILITY } from './tableStyleOps';

export function TableDecorationSections(props: ItemPanelProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const { controller, path, view, capabilities, floor } = props;
  const raw = controller.read(path);
  const style = readTableStyle(raw);
  const context = { path, controller, capabilities, floor, fontFamilies: props.fontFamilies };
  const styled = hasCapability(capabilities, 'table.style');
  // The engine paints no `style.backgroundColor` on a table, so the swatch is
  // withheld unless the document already carries one — then it stays, under the
  // banner saying it is ineffective (which renders in BOTH arms, with or
  // without `table.style`), so the key is never invisible and unremovable.
  const fill = style.ineffectiveFill !== '';
  const showFill = fill && hasCapability(capabilities, 'style.backgroundColor');
  return (
    <>
      {styled || fill ? (
        <PanelSection
          id="table.style"
          title={t('panel.tableSection.style.title')}
          summary={styled ? styleSummary(i18n, style, gridWidthOf(raw)) : ''}
          help={
            // Without `table.style` the section holds only the fill banner (and
            // its swatch), which explain themselves; the presets and switches
            // this text is about are not there.
            styled
              ? helpText(
                  t('panel.tableSection.style.help'),
                  hasCapability(capabilities, HIDDEN_HEADER_CAPABILITY)
                    ? controlHelp(
                        i18n,
                        'panel.tableStyle.hiddenHeader',
                        'panel.tableSection.style.helpHidden',
                      )
                    : '',
                )
              : undefined
          }
          defaultOpen
        >
          <IneffectiveFillBanner context={context} />
          {showFill ? (
            <PanelColorField
              label={t('panel.field.backgroundColor')}
              styleKey="backgroundColor"
              ctx={cascadeContext(controller.read, path, floor)}
              path={path}
              controller={controller}
              onNavigate={props.onNavigateDefaults}
            />
          ) : null}
          {styled ? <TableStyleBody context={context} /> : null}
        </PanelSection>
      ) : null}
      <TableTextSection {...props} />
      {hasCapability(capabilities, 'style.border') ? (
        <PanelSection
          id="table.border"
          title={t('panel.tableSection.border.title')}
          summary={borderSummary(
            i18n,
            readBorder(controller.read, path),
            borderWidthRaw(controller.read, path),
          )}
        >
          {/* No `?` on this heading: the border editor carries its own (how the
              pen and the edges work) and the note on what a table does with
              one width versus per-side widths, in all three of its hosts. */}
          <BorderEditor
            key={path}
            view={readBorder(controller.read, path)}
            radius={readRadius(controller.read, path)}
            path={path}
            controller={controller}
            capabilities={capabilities}
            isTable
          />
        </PanelSection>
      ) : null}
      {styled ? (
        <>
          <PanelSection
            id="table.headerBand"
            title={t('panel.tableSection.headerBand.title')}
            summary={bandSummary(i18n, style.header, bandStyleNames(raw, 'header'), true)}
            help={t('panel.tableSection.headerBand.help')}
          >
            <TableBandBody context={context} band="header" />
          </PanelSection>
          <PanelSection
            id="table.bodyBand"
            title={t('panel.tableSection.bodyBand.title')}
            summary={bandSummary(
              i18n,
              style.row,
              bandStyleNames(raw, 'row'),
              bodyValignHost(capabilities) !== false,
            )}
            // The section it points at is named by ITS title key, so the two
            // cannot drift apart.
            help={t('panel.tableSection.bodyBand.help', {
              section: t('panel.tableSection.style.title'),
            })}
          >
            <TableBandBody context={context} band="row" />
          </PanelSection>
        </>
      ) : null}
      <TableConditionsSection {...props} />
      <PanelSection
        id="table.styleNames"
        title={t('panel.tableSection.styleNames.title')}
        summary={styleNamesSummary(i18n, view.styleNames)}
        help={t('help.styleNames.body')}
      >
        <StyleNamesPicker controller={controller} path={path} styleNames={view.styleNames} />
      </PanelSection>
    </>
  );
}
