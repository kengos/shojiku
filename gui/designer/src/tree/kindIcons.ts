// The item-type mark per tree-node kind: the decorative icon a layer-tree row
// prepends to its label. Decorative only — `nodeLabel` carries the meaning, so
// the icon is aria-hidden and a row's text content is exactly its label. A kind
// the map does not know (a newer engine's item type) shares the generic mark,
// the same posture `kindName` takes with an unknown wire spelling.

import type { ComponentType } from 'react';
import {
  IconCharGrid,
  IconCheckbox,
  IconColumn,
  IconContainer,
  IconEllipse,
  IconHeaderGroup,
  IconImage,
  IconItem,
  IconLine,
  IconList,
  IconPageBreak,
  IconPageNumber,
  type IconProps,
  IconQrCode,
  IconRect,
  IconRepeat,
  IconRepeatFlow,
  IconSection,
  IconSectionFooter,
  IconSectionHeader,
  IconTable,
  IconText,
} from '../ui/icons';
import { SECTION_PREFIX } from './labels';

export type KindIcon = ComponentType<IconProps>;

/** One mark per engine `Item` wire tag plus the tree's structural kinds. The
 * wire's own generic `item` kind is deliberately absent — it shares the
 * unknown-kind mark, which is what it means. */
const KIND_ICONS: ReadonlyMap<string, KindIcon> = new Map<string, KindIcon>([
  ['text', IconText],
  ['rect', IconRect],
  ['line', IconLine],
  ['table', IconTable],
  ['page_number', IconPageNumber],
  ['image', IconImage],
  ['container', IconContainer],
  ['repeat', IconRepeat],
  ['repeat_flow', IconRepeatFlow],
  ['qr_code', IconQrCode],
  ['list', IconList],
  ['page_break', IconPageBreak],
  ['char_grid', IconCharGrid],
  ['ellipse', IconEllipse],
  ['checkbox', IconCheckbox],
  ['column', IconColumn],
  ['header_group', IconHeaderGroup],
]);

/** The two bands' own marks; `body` falls through to the generic section mark,
 * which is already a page with its band in the middle. */
const SECTION_ICONS: ReadonlyMap<string, KindIcon> = new Map<string, KindIcon>([
  ['header', IconSectionHeader],
  ['footer', IconSectionFooter],
]);

/** The icon component for a node's kind. */
export function kindIcon(kind: string): KindIcon {
  if (kind.startsWith(SECTION_PREFIX)) {
    // One page outline, three band positions: top / middle / bottom, the same
    // place that section actually prints. All three used to share the body
    // mark, so the icon said only "a section" — which the label already said.
    return SECTION_ICONS.get(kind.slice(SECTION_PREFIX.length)) ?? IconSection;
  }
  return KIND_ICONS.get(kind) ?? IconItem;
}
