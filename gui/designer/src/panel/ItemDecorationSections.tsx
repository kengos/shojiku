// Every non-table item's decoration tab, as collapsible sections in the order
// a presentation app's format panel uses: the text and its vertical writing
// and line breaking (`itemTextSections`), what happens when it does not fit,
// fill and border, opacity, and the named styles. A section is
// rendered only when the item's TYPE honours at least one of its controls
// (`styleSurfaces`; `typesettingModel` for the typesetting section) and the engine declares it — an empty section would be a
// heading that opens onto nothing. The first section starts open, except that
// a container opens on its fill (`openingSection`).

import { useI18n } from '../i18n/context';
import { cascadeContext } from '../toolbar/cascade';
import { effectiveValueIn } from '../toolbar/effective';
import { FillBorderFields, hasFillBorder } from './FillBorderFields';
import type { ItemPanelProps } from './itemPanelProps';
import { enumSummary, fillSectionSummary, opacitySummary } from './itemSectionSummaries';
import { type ItemSection, textSections } from './itemTextSections';
import { STYLE_NAMES_WIRE_TYPES } from './itemView';
import { OpacityField } from './OpacityField';
import { OverflowField, overflowOffered } from './OverflowFields';
import { PanelSection } from './PanelSection';
import { FieldHelp } from './panelHelpers';
import { StyleNamesPicker } from './StyleNamesPicker';
import {
  fillTitleKey,
  OPACITY_DECORATION_ONLY,
  opacityOffered,
  openingSection,
  overflowKeyOf,
} from './styleSurfaces';
import { styleNamesSummary } from './tableDecorationSummaries';

export function ItemDecorationSections(props: ItemPanelProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const { controller, path, view, capabilities } = props;
  const { type } = view;
  const ctx = cascadeContext(controller.read, path, props.floor);
  const own = (key: string) => effectiveValueIn(ctx, key).own;
  const sections: ItemSection[] = [];

  sections.push(...textSections(props, ctx, i18n));
  const overflowKey = overflowKeyOf(type);
  if (overflowKey !== null && overflowOffered(overflowKey, capabilities)) {
    sections.push({
      id: 'item.overflow',
      title: t('panel.itemSection.overflow.title'),
      summary: enumSummary(i18n, overflowKey, own(overflowKey)),
      help: t(`panel.itemSection.overflow.${overflowKey}Help`),
      body: (
        <OverflowField
          styleKey={overflowKey}
          path={path}
          controller={controller}
          ctx={ctx}
          capabilities={capabilities}
          onNavigate={props.onNavigateDefaults}
        />
      ),
    });
  }
  if (hasFillBorder(type, capabilities)) {
    sections.push({
      id: 'item.fill',
      title: t(fillTitleKey(type)),
      summary: fillSectionSummary(i18n, controller.read, path, type, own('backgroundColor')),
      help:
        type === 'char_grid'
          ? t('panel.itemSection.fill.charGridHelp', {
              section: t('panel.section.charGrid'),
              tab: t('panel.tab.box'),
            })
          : undefined,
      body: <FillBorderFields props={props} ctx={ctx} />,
    });
  }
  if (opacityOffered(type, capabilities)) {
    sections.push({
      id: 'item.opacity',
      title: t('panel.field.opacity'),
      summary: opacitySummary(i18n, own('opacity')),
      help: t(
        OPACITY_DECORATION_ONLY.has(type)
          ? 'panel.itemSection.opacity.decorationHelp'
          : 'panel.itemSection.opacity.help',
      ),
      body: (
        <OpacityField
          path={path}
          controller={controller}
          ctx={ctx}
          onNavigate={props.onNavigateDefaults}
        />
      ),
    });
  }
  if (STYLE_NAMES_WIRE_TYPES.has(type)) {
    sections.push({
      id: 'item.styleNames',
      title: t('panel.field.styleNames'),
      summary: styleNamesSummary(i18n, view.styleNames),
      body: (
        <StyleNamesPicker
          controller={controller}
          path={path}
          styleNames={view.styleNames}
          help={<FieldHelp topic="styleNames" />}
        />
      ),
    });
  }
  const opening = openingSection(type, sections);
  return (
    <>
      {sections.map((section) => (
        <PanelSection
          key={section.id}
          id={section.id}
          title={section.title}
          summary={section.summary}
          help={section.help}
          defaultOpen={section.id === opening}
        >
          {section.body}
        </PanelSection>
      ))}
    </>
  );
}
