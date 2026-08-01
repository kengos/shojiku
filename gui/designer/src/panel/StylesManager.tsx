// The styles-registry surface (the document-settings view's styles section): the
// `styles:` map CRUD. Create and field-editing both run through the unified
// `StyleForm` Modal (`panel/StyleForm`) — the new-style button opens a
// blank form, clicking a row opens it seeded from that style — so the fields no
// longer expand inline in the narrow section rail (the layout breakage this replaced).
// Rename and delete stay the row's overflow-menu actions: a rename/delete
// rewrites every reference in ONE transactional batch (one undo step), and a
// refused plan (a truncated usage walk, a non-addressable reference, an over-cap
// batch) changes nothing and surfaces a localized notice.
//
// This module owns the SECTION: the registry read, the one `run(plan)` gate
// every mutation passes through, and which Modal is mounted. What one row offers
// — its style-preview face, its overflow menu and the inline rename/confirm
// flows — is `panel/StyleRow`.

import { useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import type { StyleUsage } from '../styles/usage';
import { BTN, SECTION_TITLE } from '../ui/chrome';
import { IconPlus } from '../ui/icons';
import { StyleForm } from './StyleForm';
import { type RowMode, StyleRow } from './StyleRow';
import { REFUSAL_MESSAGE_KEY, type StyleOpPlan, type StyleOpRefusal } from './stylePlan';
import { deleteStyleOps, renameStyleOps } from './styleRefOps';
import { readStylesView, type StyleEntry } from './stylesModel';

/** The open Modal form: a blank create, or an edit seeded from a style. */
type FormState =
  | { readonly mode: 'create' }
  | { readonly mode: 'update'; readonly entry: StyleEntry };

export interface StylesManagerProps {
  readonly controller: EditorController;
  readonly fontFamilies?: readonly string[];
  /** The named-style usage index (name → references), threaded from Designer.
   * `null` (an unmaterialized document) forces a rename/delete to refuse — a
   * rewrite driven by no reference data would be unsafe. */
  readonly usage: StyleUsage | null;
  /** Show the internal `スタイル` heading (default). The document-settings view
   * passes `false` — its section heading is the one on screen. */
  readonly titled?: boolean;
}

export function StylesManager({
  controller,
  fontFamilies = [],
  usage,
  titled = true,
}: StylesManagerProps) {
  const { t } = useI18n();
  const [notice, setNotice] = useState<StyleOpRefusal | null>(null);
  const [open, setOpen] = useState<{ readonly name: string; readonly mode: RowMode } | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  const entries = readStylesView(controller.read('styles'));
  const names = entries.map((entry) => entry.name);
  // A null usage (unmaterialized document) is treated as truncated so a
  // rename/delete refuses rather than rewriting against no reference data.
  const safeUsage: StyleUsage = usage ?? { refs: new Map(), truncated: true };

  const run = (plan: StyleOpPlan, onDone: () => void) => {
    if (!plan.ok) {
      setNotice(plan.reason);
      return;
    }
    controller.applyAll(plan.ops);
    setNotice(null);
    onDone();
  };

  const submitRename = (oldName: string, newName: string) => {
    run(renameStyleOps(oldName, newName, names, safeUsage), () => setOpen(null));
  };
  const submitDelete = (name: string) => {
    run(deleteStyleOps(name, safeUsage), () => setOpen(null));
  };
  const onDeleteClick = (name: string, count: number) => {
    if (count > 0) {
      setOpen({ name, mode: 'confirmDelete' });
    } else {
      submitDelete(name);
    }
  };

  return (
    <section className="mb-4">
      {titled ? <h3 className={SECTION_TITLE}>{t('styles.title')}</h3> : null}
      {notice !== null ? (
        <output className="mb-2 block rounded-md bg-error-bg px-2 py-0.5 text-sm text-error-text">
          {t(REFUSAL_MESSAGE_KEY[notice])}
        </output>
      ) : null}
      <div>
        {entries.length === 0 ? <p className="mb-2 text-muted">{t('styles.empty')}</p> : null}
        <ul className="m-0 mb-2 list-none p-0">
          {entries.map((entry) => {
            const count = usage?.refs.get(entry.name)?.length ?? 0;
            return (
              <StyleRow
                key={entry.name}
                entry={entry}
                usageCount={count}
                active={open?.name === entry.name ? open.mode : null}
                actions={{
                  openForm: () => setForm({ mode: 'update', entry }),
                  openRename: () => setOpen({ name: entry.name, mode: 'rename' }),
                  requestDelete: () => onDeleteClick(entry.name, count),
                  closeRow: () => setOpen(null),
                  submitRename: (value) => submitRename(entry.name, value),
                  submitDelete: () => submitDelete(entry.name),
                }}
              />
            );
          })}
        </ul>
        {/* Where a style gets APPLIED — the list registers and edits looks; the
            format toolbar's picker puts one on the selected item. */}
        {entries.length > 0 ? (
          <p className="mb-2 text-sm text-muted">{t('styles.applyHint')}</p>
        ) : null}
        <button
          type="button"
          className={`${BTN} inline-flex items-center gap-1.5`}
          onClick={() => setForm({ mode: 'create' })}
        >
          <IconPlus className="shrink-0" />
          {t('styles.newStyle')}
        </button>
      </div>

      {form !== null ? (
        // Keyed by target so switching rows (or create→edit) remounts the form
        // with a fresh draft rather than carrying the previous one's edits.
        form.mode === 'create' ? (
          <StyleForm
            key="create"
            open
            mode="create"
            onClose={() => setForm(null)}
            controller={controller}
            existingNames={names}
            fontFamilies={fontFamilies}
          />
        ) : (
          <StyleForm
            key={`update:${form.entry.name}`}
            open
            mode="update"
            onClose={() => setForm(null)}
            controller={controller}
            existingNames={names}
            fontFamilies={fontFamilies}
            name={form.entry.name}
            current={form.entry.style}
            usage={usage}
          />
        )
      ) : null}
    </section>
  );
}
