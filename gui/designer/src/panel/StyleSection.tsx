// The decoration tab: the item's OWN style keys. It composes the typography rows and
// the colour swatches (`StyleTabFields.tsx`) with the border editor, a `line`
// item's stroke editor, a table's row-condition rules, and the named-style
// checkbox list. Every boxed item gets this tab (fill + border); `text`
// additionally gets the typography fields.

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import { cascadeContext } from '../toolbar/cascade';
import { FIELD_LABEL } from '../ui/chrome';
import { BorderEditor } from './BorderEditor';
import { readBorder } from './borderModel';
import { readRadius } from './borderRadius';
import { BORDER_STYLE_VALUES, BORDERABLE_TYPES } from './borderTypes';
import { CheckboxList } from './choiceFields';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import { registryNames } from './itemView';
import { LineStyleEditor } from './LineStyleEditor';
import { readLineStyle } from './lineModel';
import { applyPanelOp, styleNamesOp, toggleStyleName } from './model';
import { HelpfulHeading } from './panelHelpers';
import { pickerOptions } from './pickerModel';
import { RowConditionsSection } from './RowConditions';
import { readRawEntries } from './rowConditionsModel';
import { PanelColorField, TypographyFields } from './StyleTabFields';

export function StyleSection(props: ItemPanelProps) {
  const { t } = useI18n();
  const { controller, path, view, fontFamilies, capabilities, onNavigateDefaults } = props;
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  const ctx = cascadeContext(controller.read, path, props.floor);
  const styleNameOptions = Array.from(
    new Set([...registryNames(controller.read('styles')), ...view.styleNames]),
  );
  const isText = view.type === 'text';
  // The fill/border cluster decorates a BORDER BOX; `line` has a decoration tab
  // but no box (its stroke is its own shape, edited below).
  const boxed = BORDERABLE_TYPES.has(view.type);
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
      {boxed && hasCapability(capabilities, 'style.backgroundColor') ? (
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
      {view.type === 'table' && hasCapability(capabilities, 'table.row.conditionalStyles') ? (
        <RowConditionsSection
          path={path}
          controller={controller}
          entries={readRawEntries(controller.read, path)}
          options={
            view.dataKey === ''
              ? []
              : pickerOptions(props.paletteGroups, view.dataKey, props.params)
          }
        />
      ) : null}
      <CheckboxList
        label={t('panel.field.styleNames')}
        options={styleNameOptions}
        selected={view.styleNames}
        emptyLabel={t('panel.field.formatNone')}
        onToggle={(name, on) =>
          dispatch(styleNamesOp(path, toggleStyleName(view.styleNames, name, on)))
        }
      />
    </section>
  );
}
