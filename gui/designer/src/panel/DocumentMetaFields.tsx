// The document-metadata section of the document-settings view: the template's
// own name and version, then what the PDF says the document IS (`document:` →
// the PDF's document properties + its XMP packet), as opposed to what it draws.
//
// A live view — it re-reads the root `name`/`version` and
// `controller.read('document')` each render and
// dispatches a root-addressed named op per edit (AI parity, no direct
// mutation). Three deliberate choices:
//
//   * the template's own `name:` and `version:` lead the section. They sit at
//     the ROOT, not under `document:`, but the name IS the PDF title whenever
//     Title is left empty — so it belongs directly above the field whose
//     placeholder says so. Every engine accepts both keys, so they render even
//     where the engine lacks `template.document.metadata` and the `document:`
//     half is withheld.
//   * `language` is a COMBO over the locale tags the app already knows, not a
//     bare text box. The engine charset-gates the tag and drops anything else,
//     so a typed `日本語` would silently produce no language at all — picking
//     is the honest affordance.
//   * the `document:` half says plainly that its values do not appear on the
//     page and are absent from PNG previews, because the preview beside it will
//     not move when they change. The identity fields carry a hint line each
//     instead, since that sentence is untrue of the version (no engine reads it).

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { LOCALES } from '../i18n/locales';
import { ComboField } from './choiceFields';
import {
  type IdentityKey,
  identityOp,
  MAX_META_ENTRIES,
  META_LIST_KEYS,
  type MetaListKey,
  metaListOp,
  metaTextOp,
  readDocumentMetaView,
  readTemplateIdentity,
  removeEntry,
  replaceEntry,
} from './documentMetaModel';
import { TextField } from './fields';
import { applyPanelOp } from './model';
import { StringListField } from './StringListField';

const LOCALE_TAGS: readonly string[] = LOCALES.map((locale) => locale.tag);

/** The identity fields, in the order the section shows them. */
const IDENTITY_KEYS: readonly IdentityKey[] = ['name', 'version'];

export interface DocumentMetaFieldsProps {
  readonly controller: EditorController;
  /** The engine declares `template.document.metadata` — the `document:` half
   * renders only then. */
  readonly metadata: boolean;
}

export function DocumentMetaFields({ controller, metadata }: DocumentMetaFieldsProps) {
  const { t } = useI18n();
  const identity = readTemplateIdentity(controller.read);
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);

  return (
    <>
      {IDENTITY_KEYS.map((key) => (
        <div key={key}>
          <TextField
            label={t(`docMeta.${key}`)}
            value={identity[key]}
            placeholder={identity.unreadable[key] ? t('docMeta.unreadable') : undefined}
            onCommit={(value) =>
              dispatch(identityOp(key, identity[key], value, identity.unreadable[key]))
            }
          />
          {/* The name's hint names the Title field through ITS label key, so a
              renamed label cannot leave the hint pointing at a stale word. */}
          <p className="-mt-1 mb-2 text-sm text-muted">
            {t(`docMeta.${key}Hint`, { title: t('docMeta.docTitle') })}
          </p>
        </div>
      ))}
      {metadata ? <DocumentFields controller={controller} /> : null}
    </>
  );
}

/** The `document:` half — what the PDF says the document IS. */
function DocumentFields({ controller }: { readonly controller: EditorController }) {
  const { t } = useI18n();
  const view = readDocumentMetaView(controller.read('document'));
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  const list = (key: MetaListKey) => (key === 'keywords' ? view.keywords : view.authors);

  return (
    <>
      {/* The intro heads THIS half, not the section: it says these values go
          into the PDF's properties, which is untrue of the version above. */}
      <p className="mt-2 mb-3 text-sm text-muted">{t('docMeta.intro')}</p>
      <TextField
        label={t('docMeta.docTitle')}
        value={view.title}
        placeholder={t('docMeta.titlePlaceholder')}
        onCommit={(value) => dispatch(metaTextOp('title', view.title, value))}
      />
      <TextField
        label={t('docMeta.description')}
        value={view.description}
        onCommit={(value) => dispatch(metaTextOp('description', view.description, value))}
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
        onCommit={(value) => dispatch(metaTextOp('language', view.language, value))}
      />
      <p className="-mt-0.5 mb-2 text-sm text-muted">{t('docMeta.languageHint')}</p>
    </>
  );
}
