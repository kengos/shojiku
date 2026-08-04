// What the document-settings view is MADE OF: its sections, their order, their
// heading keys, and the one-line summary each currently holds. Pure — the page,
// its rail and any host building its own navigation read the same vocabulary.

import type { EditorController } from '../editor/useEditor';
import { readDefaultsView } from './defaultsModel';
import { readDocumentMetaView } from './documentMetaModel';
import { ENGINE_STYLE_DEFAULTS } from './engineDefaults';
import { readPageView, sizeLabel } from './pageSetupModel';
import type { Translate } from './styleLabels';
import { readStylesView } from './stylesModel';

/** The view's sections. `defaults`/`styles` also name the jump targets a style
 * field's origin hint (OriginBadge) opens; `page` is the File-menu entry point.
 * `defaults` is the document's base text — the base-text section, the same words the
 * format toolbar's style picker already uses for "no named style applied", so
 * the two surfaces name one thing once. */
export type DocSection = 'page' | 'defaults' | 'styles' | 'locale' | 'metadata';

export const SECTION_ORDER: readonly DocSection[] = [
  'page',
  'defaults',
  'styles',
  'locale',
  'metadata',
];

export const SECTION_TITLE_KEYS: Readonly<Record<DocSection, string>> = {
  page: 'pageSetup.title',
  defaults: 'defaults.textSection',
  styles: 'styles.title',
  locale: 'panel.doc.localeCurrency',
  metadata: 'docMeta.title',
};

/** The one-line "what this section currently holds" per rail entry, read from
 * the document itself. Every read is the section's own pure model, so a hostile
 * or half-written document degrades exactly as that section does. */
export function sectionSummaries(
  controller: EditorController,
  t: Translate,
): Readonly<Record<DocSection, string>> {
  const defaults = readDefaultsView(controller.read('defaults'));
  const size =
    defaults.style.fontSize === '' ? ENGINE_STYLE_DEFAULTS.fontSize : defaults.style.fontSize;
  const family = defaults.style.fontFamily;
  const meta = readDocumentMetaView(controller.read('document'));
  return {
    page: sizeLabel(readPageView(controller.read('page'))),
    defaults: family === '' ? t('defaults.sizeOnly', { size }) : `${size}pt ${family}`,
    styles: t('styles.count', { n: readStylesView(controller.read('styles')).length }),
    locale: [defaults.locale, defaults.currency].filter((v) => v !== '').join(' · '),
    // The title is what a reader's Properties panel shows first, so it is
    // the honest one-liner for this section.
    metadata: meta.title === '' ? t('docMeta.unset') : meta.title,
  };
}
