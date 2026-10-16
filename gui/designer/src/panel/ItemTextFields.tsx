// The text section's body: the typography rows, the text colour, then the
// text-look controls (letter spacing, decoration line, vertical alignment).
// A `char_grid` gets only the keys its cells honour (`charGridTextKeys`), its
// size and alignment read from its own layers and its alignment named for the
// direction its lines run (`charGridText`); every other type the full set,
// each look control gated by type in `TextLookFields`.

import { useI18n } from '../i18n/context';
import type { CascadeContext } from '../toolbar/cascade';
import { charGridContextFor, charGridVertical } from './charGridText';
import type { ItemPanelProps } from './itemPanelProps';
import { PanelColorField } from './StyleTabFields';
import { styleOptionLabel, verticalOptionLabel } from './styleLabels';
import { charGridTextKeys } from './styleSurfaces';
import { TextLookFields } from './TextLookFields';
import { TypographyFields, type TypographyRows } from './TypographyFields';

/** A char_grid's row reads; `undefined` for every other type. */
function charGridRows(props: ItemPanelProps, ctx: CascadeContext): TypographyRows | undefined {
  if (props.view.type !== 'char_grid') {
    return undefined;
  }
  const vertical = charGridVertical(props.controller.read, props.path);
  return {
    contextFor: charGridContextFor(ctx),
    optionLabel: vertical ? verticalOptionLabel : styleOptionLabel,
  };
}

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
        only={view.type === 'char_grid' ? charGridTextKeys(capabilities) : undefined}
        rows={charGridRows(props, ctx)}
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
