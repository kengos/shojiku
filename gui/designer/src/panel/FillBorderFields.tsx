// The fill-and-border section's body: the fill swatch and the border editor on
// a border box, or the item's own stroke editor where its outline is not one —
// a `line` (`LineStyleEditor`) and the two form marks (`ShapeStyleEditor`,
// one closed path). A `char_grid` takes the fill alone: its `borderWidth` is the
// grid ruling, edited on the placement tab.

import { useI18n } from '../i18n/context';
import type { CascadeContext } from '../toolbar/cascade';
import { FIELD_LABEL } from '../ui/chrome';
import { BorderEditor } from './BorderEditor';
import { readBorder } from './borderModel';
import { readRadius } from './borderRadius';
import { BORDER_STYLE_VALUES, BORDERABLE_TYPES } from './borderTypes';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import { MARK_TYPES } from './itemView';
import { LineStyleEditor } from './LineStyleEditor';
import { readLineStyle } from './lineModel';
import { ShapeStyleEditor } from './ShapeStyleEditor';
import { PanelColorField } from './StyleTabFields';
import { readShapeStyle } from './shapeStyle';

/** Whether the type gets a fill-and-border section at all against this engine. */
export function hasFillBorder(type: string, capabilities: readonly string[] | undefined): boolean {
  if (type === 'line' || MARK_TYPES.has(type)) {
    return true;
  }
  const fill = hasCapability(capabilities, 'style.backgroundColor');
  if (type === 'char_grid') {
    return fill;
  }
  return BORDERABLE_TYPES.has(type) && (fill || hasCapability(capabilities, 'style.border'));
}

export function FillBorderFields({
  props,
  ctx,
}: {
  readonly props: ItemPanelProps;
  readonly ctx: CascadeContext;
}) {
  const { t } = useI18n();
  const { controller, path, view, capabilities } = props;
  if (view.type === 'line') {
    return (
      <LineStyleEditor
        key={path}
        view={readLineStyle(controller.read, path, BORDER_STYLE_VALUES)}
        path={path}
        controller={controller}
        capabilities={capabilities}
      />
    );
  }
  if (MARK_TYPES.has(view.type)) {
    return (
      <ShapeStyleEditor
        key={path}
        view={readShapeStyle(controller.read, path)}
        path={path}
        controller={controller}
      />
    );
  }
  const border = BORDERABLE_TYPES.has(view.type) && hasCapability(capabilities, 'style.border');
  return (
    <>
      {hasCapability(capabilities, 'style.backgroundColor') ? (
        <PanelColorField
          label={t('panel.field.backgroundColor')}
          styleKey="backgroundColor"
          ctx={ctx}
          path={path}
          controller={controller}
          onNavigate={props.onNavigateDefaults}
        />
      ) : null}
      {border ? (
        <div className="mb-2">
          <span className={FIELD_LABEL}>{t('panel.field.border')}</span>
          <BorderEditor
            key={path}
            view={readBorder(controller.read, path)}
            radius={readRadius(controller.read, path)}
            path={path}
            controller={controller}
            capabilities={capabilities}
            isTable={false}
          />
        </div>
      ) : null}
    </>
  );
}
