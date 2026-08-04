// The document-metadata section of the document-settings view: what the PDF
// says the document IS (`document:` → the PDF's document properties + its XMP
// packet), as opposed to what it draws.
//
// A live view — it re-reads `controller.read('document')` each render and
// dispatches a root-addressed named op per edit (AI parity, no direct
// mutation). Two deliberate choices:
//
//   * `language` is a COMBO over the locale tags the app already knows, not a
//     bare text box. The engine charset-gates the tag and drops anything else,
//     so a typed `日本語` would silently produce no language at all — picking
//     is the honest affordance.
//   * the section says plainly that these values do not appear on the page and
//     are absent from PNG previews, because the preview beside it will not move
//     when they change.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { LOCALES } from '../i18n/locales';
import { ComboField } from './choiceFields';
import {
  MAX_META_ENTRIES,
  META_LIST_KEYS,
  type MetaListKey,
  metaListOp,
  metaTextOp,
  readDocumentMetaView,
  removeEntry,
  replaceEntry,
} from './documentMetaModel';
import { TextField } from './fields';
import { applyPanelOp } from './model';
import { StringListField } from './StringListField';

const LOCALE_TAGS: readonly string[] = LOCALES.map((locale) => locale.tag);

export interface DocumentMetaFieldsProps {
  readonly controller: EditorController;
}

export function DocumentMetaFields({ controller }: DocumentMetaFieldsProps) {
  const { t } = useI18n();
  const view = readDocumentMetaView(controller.read('document'));
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  const list = (key: MetaListKey) => (key === 'keywords' ? view.keywords : view.authors);

  return (
    <>
      <p className="mt-0 mb-3 text-sm text-muted">{t('docMeta.intro')}</p>
      <TextField
        label={t('docMeta.docTitle')}
        value={view.title}
        placeholder={t('docMeta.titlePlaceholder')}
        onCommit={(value) => dispatch(metaTextOp('title', value))}
      />
      <TextField
        label={t('docMeta.description')}
        value={view.description}
        onCommit={(value) => dispatch(metaTextOp('description', value))}
      />
      {META_LIST_KEYS.map((key) => (
        <StringListField
          key={key}
          label={t(`docMeta.${key}`)}
          entries={list(key)}
          removeLabel={t('docMeta.remove')}
          addPlaceholder={t('docMeta.addEntry')}
          max={MAX_META_ENTRIES}
          onCommit={(index, value) =>
            dispatch(metaListOp(key, replaceEntry(list(key), index, value)))
          }
          onRemove={(index) => dispatch(metaListOp(key, removeEntry(list(key), index)))}
        />
      ))}
      <ComboField
        label={t('docMeta.language')}
        value={view.language}
        options={LOCALE_TAGS}
        listId="sj-document-language"
        onCommit={(value) => dispatch(metaTextOp('language', value))}
      />
      <p className="-mt-0.5 mb-2 text-sm text-muted">{t('docMeta.languageHint')}</p>
    </>
  );
}
