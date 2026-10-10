// The content tab's `page_number` surface — its pattern field. `ContentSection`
// beside this file routes to it and owns the text/data pair every other
// content-bearing type shares; an image's surface is `contentImage.tsx`.

import { useI18n } from '../i18n/context';
import { FIELD_LABEL, INPUT } from '../ui/chrome';
import type { ItemPanelProps } from './itemPanelProps';
import { applyPanelOp, plainTextOp } from './model';
import { HelpfulHeading } from './panelHelpers';

/** The engine's own page-number pattern, shown as the field's placeholder so
 * an unset value reads as a value rather than a blank. */
const DEFAULT_PAGE_FORMAT = '{page} / {pages}';

/** A pattern is a label, not a document — long enough for the ja default `- {page}ページ -`,
 * short enough that the field can never carry a payload. */
const MAX_PAGE_FORMAT_CHARS = 80;

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
