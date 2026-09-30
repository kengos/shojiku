// Every non-table item's decoration tab, as collapsible sections in the order
// a presentation app's format panel uses: the text, what happens when it does
// not fit, fill and border, opacity, and the named styles. A section is
// rendered only when the item's TYPE honours at least one of its controls
// (`styleSurfaces`) and the engine declares it — an empty section would be a
// heading that opens onto nothing. The first section starts open, except that
// a container opens on its fill (`openingSection`).

import type { ReactNode } from 'react';
import { useI18n } from '../i18n/context';
import { cascadeContext } from '../toolbar/cascade';
import { effectiveValueIn } from '../toolbar/effective';
import { FillBorderFields, hasFillBorder } from './FillBorderFields';
import { ItemTextFields } from './ItemTextFields';
import type { ItemPanelProps } from './itemPanelProps';
import {
  enumSummary,
  fillSectionSummary,
  itemTextSummary,
  opacitySummary,
} from './itemSectionSummaries';
import { STYLE_NAMES_WIRE_TYPES } from './itemView';
import { OpacityField } from './OpacityField';
import { OverflowField, overflowOffered } from './OverflowFields';
import { PanelSection } from './PanelSection';
import { FieldHelp } from './panelHelpers';
import { StyleNamesPicker } from './StyleNamesPicker';
import type { SectionId } from './sectionOpenState';
import {
  fillTitleKey,
  OPACITY_DECORATION_ONLY,
  opacityOffered,
  openingSection,
  overflowKeyOf,
  TEXT_INHERIT_TYPES,
  TEXT_SURFACE_TYPES,
  textHelpKey,
} from './styleSurfaces';
import { styleNamesSummary } from './tableDecorationSummaries';
import { readBand } from './tableStyleModel';

interface Section {
  readonly id: SectionId;
  readonly title: string;
  readonly summary: string;
  readonly help?: string;
  readonly body: ReactNode;
}

export function ItemDecorationSections(props: ItemPanelProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const { controller, path, view, capabilities } = props;
  const { type } = view;
  const ctx = cascadeContext(controller.read, path, props.floor);
  const own = (key: string) => effectiveValueIn(ctx, key).own;
  const sections: Section[] = [];

  if (TEXT_SURFACE_TYPES.has(type) || TEXT_INHERIT_TYPES.has(type) || type === 'char_grid') {
    const helpKey = textHelpKey(type);
    sections.push({
      id: 'item.text',
      title: t('panel.itemSection.text.title'),
      summary: itemTextSummary(
        i18n,
        readBand(controller.read(path)),
        own('letterSpacing'),
        own('textDecoration'),
      ),
      help: helpKey === undefined ? undefined : t(helpKey),
      body: <ItemTextFields props={props} ctx={ctx} />,
    });
  }
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
