// The decoration tab: the item's OWN style keys. It composes the typography rows and
// the colour swatches (`StyleTabFields.tsx`) with the border editor, a `line`
// item's stroke editor, a table's row-condition rules, and the
// named-style picker. Every boxed item gets this tab (fill + border); `text`
// additionally gets the typography fields.
//
// The named-style picker is a SHARED leaf (`StyleNamesPicker`) rather than a
// block inlined here: `char_grid` has no decoration tab and needs the same
// control on its placement tab, and a second copy would be two things to keep
// in agreement.

import { useI18n } from '../i18n/context';
import { cascadeContext } from '../toolbar/cascade';
import { FIELD_LABEL } from '../ui/chrome';
import { BorderEditor } from './BorderEditor';
import { readBorder } from './borderModel';
import { readRadius } from './borderRadius';
import { BORDER_STYLE_VALUES, BORDERABLE_TYPES } from './borderTypes';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import { MARK_TYPES } from './itemView';
import { LineStyleEditor } from './LineStyleEditor';
import { readLineStyle } from './lineModel';
import { FieldHelp, HelpfulHeading } from './panelHelpers';
import { pickerOptions } from './pickerModel';
import { RowConditionsSection } from './RowConditions';
import { readRawEntries } from './rowConditionsModel';
import { ShapeStyleEditor } from './ShapeStyleEditor';
import { StyleNamesPicker } from './StyleNamesPicker';
import { PanelColorField, TypographyFields } from './StyleTabFields';
import { readShapeStyle } from './shapeStyle';
import { TableStyleSection } from './TableStyleSection';
import { readTableStyle } from './tableStyleModel';

export function StyleSection(props: ItemPanelProps) {
  const { t } = useI18n();
  const { controller, path, view, fontFamilies, capabilities, onNavigateDefaults } = props;
  const ctx = cascadeContext(controller.read, path, props.floor);
  const isText = view.type === 'text';
  // The fill/border cluster decorates a BORDER BOX; `line` has a decoration tab
  // but no box (its stroke is its own shape, edited below).
  const boxed = BORDERABLE_TYPES.has(view.type);
  // A TABLE paints no `style.backgroundColor` — the engine asserts it — so the
  // fill swatch would author a key nothing draws. It is withheld unless the
  // document already carries one, in which case the table-style section below
  // shows it as ineffective and offers to clear it: hiding an authored key
  // outright would leave it invisible and unremovable in the panel.
  const isTable = view.type === 'table';
  const showFill =
    boxed && (!isTable || readTableStyle(controller.read(path)).ineffectiveFill !== '');
  return (
    <section>
      <HelpfulHeading
        title={t('panel.section.style')}
        topic="style"
        onOpenGlossary={props.onOpenGlossary}
      />
      {isText ? (
        <TypographyFields
          controller={controller}
          path={path}
          style={view.style}
          fontFamilies={fontFamilies}
          ctx={ctx}
          onNavigate={onNavigateDefaults}
        />
      ) : null}
      {/* Fill & border — the fill-and-border cluster, on every boxed item; text color
          rides with the typography fields above. */}
      {isText ? (
        <PanelColorField
          label={t('panel.field.color')}
          styleKey="color"
          ctx={ctx}
          path={path}
          controller={controller}
          onNavigate={onNavigateDefaults}
        />
      ) : null}
      {showFill && hasCapability(capabilities, 'style.backgroundColor') ? (
        <PanelColorField
          label={t('panel.field.backgroundColor')}
          styleKey="backgroundColor"
          ctx={ctx}
          path={path}
          controller={controller}
          onNavigate={onNavigateDefaults}
        />
      ) : null}
      {boxed && hasCapability(capabilities, 'style.border') ? (
        <div className="mb-2">
          <span className={FIELD_LABEL}>{t('panel.field.border')}</span>
          <BorderEditor
            key={path}
            view={readBorder(controller.read, path)}
            radius={readRadius(controller.read, path)}
            path={path}
            controller={controller}
            capabilities={capabilities}
            isTable={view.type === 'table'}
          />
        </div>
      ) : null}
      {MARK_TYPES.has(view.type) ? (
        // A form mark's outline is one closed path, so it gets a UNIFORM
        // stroke + fill rather than the border cluster above: a per-side map
        // reduces to its top side with `shape_border_sides_ignored`, and a
        // `borderRadius` is answered with `border_radius_ignored`. The
        // editor authors neither.
        <ShapeStyleEditor
          key={path}
          view={readShapeStyle(controller.read, path)}
          path={path}
          controller={controller}
        />
      ) : null}
      {view.type === 'line' ? (
        // A line's stroke is its OWN shape (width/color/style), not the
        // border box the cluster above edits — and the insert menu can
        // create one (cut-here line), so it needs an editing surface.
        <LineStyleEditor
          key={path}
          view={readLineStyle(controller.read, path, BORDER_STYLE_VALUES)}
          path={path}
          controller={controller}
          capabilities={capabilities}
        />
      ) : null}
      {isTable ? (
        <TableStyleSection context={{ path, controller, capabilities, floor: props.floor }} />
      ) : null}
      {isTable && hasCapability(capabilities, 'table.row.conditionalStyles') ? (
        <RowConditionsSection
          path={path}
          controller={controller}
          floor={props.floor}
          entries={readRawEntries(controller.read, path)}
          options={
            view.dataKey === ''
              ? []
              : pickerOptions(props.paletteGroups, view.dataKey, props.params)
          }
        />
      ) : null}
      {/* The same `?` the char_grid placement tab gives this control. It is one
          group with one label, and 「Styles」 is exactly as inscrutable here as
          there — the criterion is the field's NAME, not which tab it sits on. */}
      <StyleNamesPicker
        controller={controller}
        path={path}
        styleNames={view.styleNames}
        help={<FieldHelp topic="styleNames" />}
      />
    </section>
  );
}
