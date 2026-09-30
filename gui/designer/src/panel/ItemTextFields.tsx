// The text section's body: the typography rows, the text colour, then the
// text-look controls (letter spacing, decoration line, vertical alignment).
// A `char_grid` gets only the keys its cells honour (`CHAR_GRID_GLYPH_KEYS`);
// every other type the full set, each look control gated by type in
// `TextLookFields`.

import { useI18n } from '../i18n/context';
import type { CascadeContext } from '../toolbar/cascade';
import type { ItemPanelProps } from './itemPanelProps';
import { PanelColorField, TypographyFields } from './StyleTabFields';
import { CHAR_GRID_GLYPH_KEYS } from './styleSurfaces';
import { TextLookFields } from './TextLookFields';

export function ItemTextFields({
  props,
  ctx,
}: {
  readonly props: ItemPanelProps;
  readonly ctx: CascadeContext;
}) {
  const { t } = useI18n();
  const { controller, path, view, capabilities, onNavigateDefaults: onNavigate } = props;
  return (
    <>
      <TypographyFields
        controller={controller}
        path={path}
        style={view.style}
        fontFamilies={props.fontFamilies}
        ctx={ctx}
        onNavigate={onNavigate}
        only={view.type === 'char_grid' ? CHAR_GRID_GLYPH_KEYS : undefined}
      />
      <PanelColorField
        label={t('panel.field.color')}
        styleKey="color"
        ctx={ctx}
        path={path}
        controller={controller}
        onNavigate={onNavigate}
      />
      <TextLookFields
        type={view.type}
        path={path}
        controller={controller}
        ctx={ctx}
        capabilities={capabilities}
        onNavigate={onNavigate}
      />
    </>
  );
}
