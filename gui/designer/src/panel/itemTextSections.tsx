// The TEXT half of an item's decoration tab: the 「Text」 section (typography,
// colour, the text-look controls) and, after it, the vertical-writing and
// line-breaking section (`TypesettingSection`). Split from
// `ItemDecorationSections`, which lists every section in order and owns the
// opening rule; this file answers only which of these two the type gets and
// what each says while closed.

import type { ReactNode } from 'react';
import type { CascadeContext } from '../toolbar/cascade';
import { effectiveValueIn } from '../toolbar/effective';
import { ItemTextFields } from './ItemTextFields';
import type { ItemPanelProps } from './itemPanelProps';
import { itemTextSummary } from './itemSectionSummaries';
import type { SectionId } from './sectionOpenState';
import { TEXT_INHERIT_TYPES, TEXT_SURFACE_TYPES, textHelpKey } from './styleSurfaces';
import { typesettingParts } from './TypesettingSection';
import type { SummaryI18n } from './tableContentSummaries';
import { readBand } from './tableStyleModel';

/** One collapsible section of an item's decoration tab, as data. */
export interface ItemSection {
  readonly id: SectionId;
  readonly title: string;
  readonly summary: string;
  readonly help?: string;
  readonly body: ReactNode;
}

/** The text sections the item's type gets, in tab order (possibly none). */
export function textSections(
  props: ItemPanelProps,
  ctx: CascadeContext,
  i18n: SummaryI18n,
): ItemSection[] {
  const { t } = i18n;
  const { type } = props.view;
  const own = (key: string) => effectiveValueIn(ctx, key).own;
  const sections: ItemSection[] = [];
  if (TEXT_SURFACE_TYPES.has(type) || TEXT_INHERIT_TYPES.has(type) || type === 'char_grid') {
    const helpKey = textHelpKey(type);
    sections.push({
      id: 'item.text',
      title: t('panel.itemSection.text.title'),
      summary: itemTextSummary(
        i18n,
        readBand(props.controller.read(props.path)),
        own('letterSpacing'),
        own('textDecoration'),
      ),
      help: helpKey === undefined ? undefined : t(helpKey),
      body: <ItemTextFields props={props} ctx={ctx} />,
    });
  }
  const typesetting = typesettingParts(props, i18n);
  if (typesetting !== null) {
    sections.push({
      id: 'item.typesetting',
      title: t('panel.itemSection.typesetting.title'),
      ...typesetting,
    });
  }
  return sections;
}
