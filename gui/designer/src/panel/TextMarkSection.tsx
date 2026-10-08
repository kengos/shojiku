// A circle around a text item's glyphs (`mark:`) on its CONTENT tab: whether it
// draws — always, or when a data field says so — how far it stands off the
// glyphs, its outline and fill, and its named styles, in one section (the
// user's placement decision). A SIBLING of the content section, for the
// `RubySection` reason: that section returns the spans editor early, and the
// engine draws the circle over a spans text as well.
//
// Two gates, like ruby: the TYPE (`TextItem` is the only struct with `mark`) and
// the CAPABILITY (an older engine rejects `mark` at parse). The model is
// `textMarkModel.ts`; the binding fields and the outline editor are the ones the
// `ellipse` uses, pointed at `<item>.mark`, because the wire is the same
// `MarkBinding` and the same `shape_paint`.
//
// Every control inside the mark writes at `<item>.mark`, never at the item with a
// `mark.` prefix: `removeKey` prunes the maps its `keys` name when they empty, so
// unticking the last named style through `keys: ['mark', 'styleNames']` would
// take an otherwise-empty `mark: {}` — the always-drawn circle — with it.

import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { cascadeContext } from '../toolbar/cascade';
import { effectiveValueIn } from '../toolbar/effective';
import { BTN_SM, INPUT } from '../ui/chrome';
import { Field } from './fields';
import type { ItemPanelProps } from './itemPanelProps';
import { hasCapability } from './itemPanelProps';
import { MarkBindingFields } from './MarkBindingFields';
import { readMark } from './markModel';
import { applyPanelOp } from './model';
import { NumericComboField } from './NumericComboField';
import { chipsFor, FieldHelp, HelpfulHeading, scopePickerProps } from './panelHelpers';
import { ShapeStyleEditor } from './ShapeStyleEditor';
import { StyleNamesPicker } from './StyleNamesPicker';
import { readShapeStyle } from './shapeStyle';
import {
  clearTextMarkOp,
  DEFAULT_MARK_PADDING,
  MARK_PADDING_PRESETS,
  markPaddingOp,
  readTextMark,
  TEXT_MARK_CAPABILITY,
  type TextMarkPresence,
  type TextMarkView,
  textMarkPresenceOps,
} from './textMarkModel';
import { VERTICAL_RL } from './typesettingModel';

export function TextMarkSection(props: ItemPanelProps) {
  const { t } = useI18n();
  const { controller, path, view: item, capabilities } = props;
  if (item.type !== 'text' || !hasCapability(capabilities, TEXT_MARK_CAPABILITY)) {
    return null;
  }
  const view = readTextMark(controller.read, path);
  // The engine skips the circle on a vertical block (`vertical_text_unsupported`)
  // — the same sentence the vertical-text section shows beside its switch.
  const vertical =
    effectiveValueIn(cascadeContext(controller.read, path, props.floor), 'writingMode').value ===
    VERTICAL_RL;
  return (
    <section className="mt-4">
      <HelpfulHeading
        title={t('panel.textMark.title')}
        topic="textMark"
        onOpenGlossary={props.onOpenGlossary}
      />
      {view.state === 'unreadable' ? (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm text-muted italic">{t('panel.textMark.unreadable')}</span>
          <button
            type="button"
            className={BTN_SM}
            onClick={() => applyPanelOp(controller, clearTextMarkOp(path))}
          >
            {t('panel.textMark.clear')}
          </button>
        </div>
      ) : (
        <TextMarkFields props={props} view={view} />
      )}
      {vertical && view.state !== 'absent' ? (
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          {t('panel.itemSection.typesetting.markVertical')}
        </p>
      ) : null}
    </section>
  );
}

function TextMarkFields({ props, view }: { props: ItemPanelProps; view: TextMarkView }) {
  const { t } = useI18n();
  const { controller, path } = props;
  const chips = chipsFor(props);
  const { documentOptions } = scopePickerProps(props, chips);
  const [paddingRefused, setPaddingRefused] = useState(false);
  return (
    <>
      <Field label={t('panel.textMark.state')}>
        <select
          className={INPUT}
          value={view.presence}
          // One batch per switch — one undo step — and an unchanged pick is an
          // empty batch, so re-picking the current state authors nothing.
          onChange={(event) =>
            controller.applyAll(
              textMarkPresenceOps(path, view, event.currentTarget.value as TextMarkPresence),
            )
          }
        >
          <option value="none">{t('panel.textMark.state.none')}</option>
          <option value="always">{t('panel.textMark.state.always')}</option>
          <option value="bound">{t('panel.mark.state.bound')}</option>
        </select>
      </Field>
      {view.presence === 'bound' ? (
        <MarkBindingFields
          controller={controller}
          markPath={view.markPath}
          row={readMark(controller.read, view.markPath)}
          options={chips.options}
          documentOptions={documentOptions}
          valueLabel={t('panel.textMark.value')}
        />
      ) : null}
      {view.state === 'map' ? (
        <>
          <div className="mt-2 mb-2">
            <NumericComboField
              label={t('panel.textMark.padding')}
              value={view.paddingUnreadable ? t('panel.textMark.paddingUnreadable') : view.padding}
              placeholder={DEFAULT_MARK_PADDING}
              hint={paddingRefused ? t('panel.textMark.paddingRefused') : undefined}
              presets={[
                {
                  value: '',
                  label: DEFAULT_MARK_PADDING,
                  note: t('panel.textMark.paddingDefault'),
                },
                ...MARK_PADDING_PRESETS.map((value) => ({ value })),
              ]}
              onCommit={(raw) => {
                const entry = raw.trim();
                const op = markPaddingOp(view, entry);
                // Refused, as opposed to unchanged: an empty or same value says nothing.
                setPaddingRefused(op === null && entry !== '' && entry !== view.padding);
                applyPanelOp(controller, op);
              }}
            />
          </div>
          <ShapeStyleEditor
            view={readShapeStyle(controller.read, view.markPath)}
            path={view.markPath}
            controller={controller}
          />
          <StyleNamesPicker
            controller={controller}
            path={view.markPath}
            styleNames={view.styleNames}
            label={t('panel.textMark.styleNames')}
            help={<FieldHelp topic="styleNames" />}
          />
        </>
      ) : null}
    </>
  );
}
