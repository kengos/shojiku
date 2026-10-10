// The content tab of an `image` item: where the picture comes from — a fixed
// source (`src`) or a data field (`data:`) — chosen with the SAME select the
// text pair uses, then that source's own fields, then the fit both share (the
// engine fits a bound image exactly as it fits a fixed one).
//
// The switch plans live in `imageSourceOps.ts`; the memory of what a switch
// dropped is `ContentSection`'s, which outlives this component when the
// selection moves to an item of another type and back.

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import type { ChipContext } from '../text/chipContext';
import { BTN_SM, INPUT, SECTION_TITLE } from '../ui/chrome';
import { FieldPicker } from './FieldPicker';
import { FitField } from './FitField';
import { Field } from './fields';
import {
  type ImageMemory,
  type ImageSourceMode,
  imageSourceMode,
  planImageSwitch,
} from './imageSourceOps';
import type { ItemPanelProps } from './itemPanelProps';
import { imageSourceSummary } from './itemView';
import { applyPanelOp, bindingKeyOp, plainTextOp } from './model';
import { documentScopeCreateField, scopePickerProps } from './panelHelpers';

/** Whether the fixed option can be chosen: it is the mode already shown (an
 * image with neither source reads as fixed, and the selected option must not
 * read as unavailable), or a switch can produce a `src` — the item already
 * has one (both keys present), this panel remembers one for it, or the host
 * can pick a file. Otherwise the option would promise a switch it cannot make. */
function canFix(props: ItemPanelProps, memory: ImageMemory | null): boolean {
  if (props.view.hasSrc || !props.view.hasData) {
    return true;
  }
  if (props.onFixImageSource === undefined) {
    return false;
  }
  const remembered = memory?.path === props.path && memory.src !== undefined;
  return remembered || props.onReplaceImage !== undefined;
}

export function ImageContent({
  props,
  chips,
  memory,
}: {
  readonly props: ItemPanelProps;
  readonly chips: ChipContext;
  readonly memory: { current: ImageMemory | null };
}) {
  const { t } = useI18n();
  const { controller, path, view, capabilities, onReplaceImage, onFixImageSource } = props;
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  const mode = imageSourceMode(view);
  const onSwitch = (target: ImageSourceMode) => {
    // A change event for the mode already shown would rewrite the binding with
    // an empty key — nothing a reader asked for — so it authors nothing.
    if (target === mode) {
      return;
    }
    const plan = planImageSwitch(path, view, target, memory.current);
    memory.current = plan.memory;
    if (plan.kind === 'ops') {
      controller.applyAll(plan.ops);
    } else {
      onFixImageSource?.(path, plan.kind === 'restore' ? plan.src : null);
    }
  };
  return (
    <section>
      <h3 className={SECTION_TITLE}>{t('panel.section.image')}</h3>
      <Field label={t('panel.contentMode')}>
        <select
          className={INPUT}
          value={mode}
          onChange={(event) => onSwitch(event.currentTarget.value as ImageSourceMode)}
        >
          <option value="fixed" disabled={!canFix(props, memory.current)}>
            {t('panel.contentMode.image')}
          </option>
          <option value="data">{t('panel.contentMode.data')}</option>
        </select>
      </Field>
      {mode === 'data' ? (
        <FieldPicker
          label={t('panel.field.dataKey')}
          value={view.dataKey}
          options={chips.options}
          onCommit={(v) => dispatch(bindingKeyOp(path, v))}
          onCreateField={documentScopeCreateField(props)}
          {...scopePickerProps(props, chips)}
        />
      ) : (
        <>
          {view.src === '' ? (
            <p className="m-0 text-muted">{t('panel.image.none')}</p>
          ) : (
            <p className="m-0 mb-2 text-[12px] text-muted">
              {t('panel.image.summary', {
                format: imageSourceSummary(view.src).format,
                kib: imageSourceSummary(view.src).kib,
              })}
            </p>
          )}
          {onReplaceImage !== undefined ? (
            <button
              type="button"
              className={BTN_SM}
              onClick={() => onReplaceImage(path, view.src.length)}
            >
              {t('panel.image.replace')}
            </button>
          ) : null}
        </>
      )}
      <FitField
        value={view.fit}
        capabilities={capabilities}
        onCommit={(v) => dispatch(plainTextOp(path, ['fit'], v))}
      />
    </section>
  );
}
