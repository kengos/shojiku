// The content tab's per-TYPE content surfaces — an `image` item's source/fit
// cluster and a `page_number`'s pattern field. `ContentSection` beside this file
// routes to them and owns the text/data pair every other content-bearing type
// shares.

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import type { ChipContext } from '../text/chipContext';
import { BTN_SM, FIELD_LABEL, INPUT, SECTION_TITLE } from '../ui/chrome';
import { SelectField } from './choiceFields';
import { FieldPicker } from './FieldPicker';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import { imageSourceSummary } from './itemView';
import { applyPanelOp, bindingKeyOp, plainTextOp } from './model';
import { documentScopeCreateField, HelpfulHeading, scopePickerProps } from './panelHelpers';

const IMAGE_FIT_MODES = ['contain', 'cover', 'stretch', 'none'] as const;
const IMAGE_FIT_MODES_BASE = ['contain', 'stretch'] as const;

/** The engine's own page-number pattern, shown as the field's placeholder so
 * an unset value reads as a value rather than a blank. */
const DEFAULT_PAGE_FORMAT = '{page} / {pages}';

/** A pattern is a label, not a document — long enough for the ja default `- {page}ページ -`,
 * short enough that the field can never carry a payload. */
const MAX_PAGE_FORMAT_CHARS = 80;

export function ImageContent(props: ItemPanelProps & { readonly chips: ChipContext }) {
  const { t } = useI18n();
  const { controller, path, view, capabilities, onReplaceImage, chips } = props;
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  if (view.hasData) {
    return (
      <section>
        <h3 className={SECTION_TITLE}>{t('panel.section.content')}</h3>
        <FieldPicker
          label={t('panel.field.dataKey')}
          value={view.dataKey}
          options={chips.options}
          onCommit={(v) => dispatch(bindingKeyOp(path, v))}
          onCreateField={documentScopeCreateField(props)}
          {...scopePickerProps(props, chips)}
        />
      </section>
    );
  }
  return (
    <section>
      <h3 className={SECTION_TITLE}>{t('panel.section.image')}</h3>
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
      <SelectField
        label={t('panel.field.fit')}
        value={view.fit}
        options={
          hasCapability(capabilities, 'image.fit.cover_none')
            ? [...IMAGE_FIT_MODES]
            : [...IMAGE_FIT_MODES_BASE]
        }
        noneLabel={t('panel.field.formatNone')}
        onCommit={(v) => dispatch(plainTextOp(path, ['fit'], v))}
      />
    </section>
  );
}

/** A `page_number`'s pattern field. The pattern is a free string because its two
 * tokens ARE the vocabulary — they are shown in the hint, and anything else
 * prints through verbatim, which is the documented behavior rather than an
 * error. */
export function PageNumberContent(props: ItemPanelProps) {
  const { t } = useI18n();
  const { controller, path, view } = props;
  return (
    <section>
      <HelpfulHeading title={t('panel.section.content')} topic="content" />
      <label className={FIELD_LABEL} htmlFor="sj-page-format">
        {t('panel.pageFormat')}
      </label>
      <input
        id="sj-page-format"
        key={view.pageFormat}
        className={INPUT}
        defaultValue={view.pageFormat}
        maxLength={MAX_PAGE_FORMAT_CHARS}
        placeholder={DEFAULT_PAGE_FORMAT}
        onBlur={(e) => {
          if (e.target.value !== view.pageFormat) {
            applyPanelOp(controller, plainTextOp(path, ['format'], e.target.value));
          }
        }}
      />
      <p className="mt-1 mb-0 text-xs text-muted">{t('panel.pageFormat.hint')}</p>
    </section>
  );
}
