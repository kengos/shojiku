// The named-formats surface (the document-settings 書式 section): the
// `formats:` registry CRUD, mirroring the styles registry so an author who has
// learnt one has learnt both. Create and editing both run through the unified
// `FormatForm` Modal — the new-format button opens a blank form, clicking a row
// opens it seeded from that entry — while rename and delete stay the row's
// overflow-menu actions: each rewrites every reference in ONE transactional
// batch (one undo step), and a refused plan (a truncated usage walk, a
// non-addressable reference, an over-cap batch) changes nothing and surfaces a
// localized notice.
//
// This module owns the SECTION: the registry read, the one `run(plan)` gate
// every mutation passes through, and which Modal is mounted. What one row
// offers is `panel/FormatRow`.

import { useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import type { FormatCatalog, PatternProbe, ProbeResult } from '../engine/types';
import { type FormatEntry, readFormatsView } from '../formats/model';
import { type FormatOpPlan, type FormatOpRefusal, REFUSAL_MESSAGE_KEY } from '../formats/plan';
import { deleteFormatOps, renameFormatOps } from '../formats/refOps';
import type { FormatUsage } from '../formats/usage';
import { useI18n } from '../i18n/context';
import { BTN, SECTION_TITLE } from '../ui/chrome';
import { IconPlus } from '../ui/icons';
import { FormatForm } from './FormatForm';
import { FormatRow, type FormatRowMode } from './FormatRow';
import { variantSamples } from './formatModel';

type FormState =
  | { readonly mode: 'create' }
  | { readonly mode: 'update'; readonly entry: FormatEntry };

export interface FormatsManagerProps {
  readonly controller: EditorController;
  /** The format-reference index, threaded from the Designer. `null` (an
   * unmaterialized document) forces a rename/delete to refuse — a rewrite
   * driven by no reference data would be unsafe. */
  readonly usage: FormatUsage | null;
  /** The engine's catalog, for each row's rendered sample. */
  readonly catalog: FormatCatalog | null;
  readonly probe: (probes: readonly PatternProbe[]) => Promise<readonly ProbeResult[]>;
  /** The session's template-size cap. A rename grows the document by the name
   * delta at every reference, and nothing downstream re-checks the bytes. */
  readonly maxBytes: number;
}

export function FormatsManager({
  controller,
  usage,
  catalog,
  probe,
  maxBytes,
}: FormatsManagerProps) {
  const { t } = useI18n();
  const [notice, setNotice] = useState<FormatOpRefusal | null>(null);
  const [open, setOpen] = useState<{ readonly name: string; readonly mode: FormatRowMode } | null>(
    null,
  );
  const [form, setForm] = useState<FormState | null>(null);

  const entries = readFormatsView(controller.read('formats'));
  const names = entries.map((entry) => entry.name);
  // A null usage (unmaterialized document) is treated as truncated so a
  // rename/delete refuses rather than rewriting against no reference data.
  const safeUsage: FormatUsage = usage ?? { refs: new Map(), truncated: true };

  const run = (plan: FormatOpPlan, onDone: () => void) => {
    if (!plan.ok) {
      setNotice(plan.reason);
      return;
    }
    controller.applyAll(plan.ops);
    setNotice(null);
    onDone();
  };

  const submitRename = (oldName: string, newName: string) => {
    run(
      renameFormatOps(oldName, newName, names, safeUsage, {
        textBytes: new TextEncoder().encode(controller.text).length,
        maxBytes,
      }),
      () => setOpen(null),
    );
  };
  const submitDelete = (name: string) => {
    run(deleteFormatOps(name, safeUsage), () => setOpen(null));
  };

  return (
    <section className="mb-4">
      {notice !== null ? (
        <output className="mb-2 block rounded-md bg-error-bg px-2 py-0.5 text-sm text-error-text">
          {t(REFUSAL_MESSAGE_KEY[notice])}
        </output>
      ) : null}
      <h4 className={SECTION_TITLE}>{t('formats.registryTitle')}</h4>
      <p className="mt-0 mb-2 text-sm text-muted">{t('formats.registryIntro')}</p>
      {entries.length === 0 ? <p className="mb-2 text-muted">{t('formats.empty')}</p> : null}
      <ul className="m-0 mb-2 list-none p-0">
        {entries.map((entry) => {
          const count = usage?.refs.get(entry.name)?.length ?? 0;
          return (
            <FormatRow
              key={entry.name}
              entry={entry}
              usageCount={count}
              samples={variantSamples(catalog, entry.kind, entry.name)}
              active={open?.name === entry.name ? open.mode : null}
              actions={{
                openForm: () => setForm({ mode: 'update', entry }),
                openRename: () => setOpen({ name: entry.name, mode: 'rename' }),
                requestDelete: () =>
                  count > 0
                    ? setOpen({ name: entry.name, mode: 'confirmDelete' })
                    : submitDelete(entry.name),
                closeRow: () => setOpen(null),
                submitRename: (value) => submitRename(entry.name, value),
                submitDelete: () => submitDelete(entry.name),
              }}
            />
          );
        })}
      </ul>
      <button
        type="button"
        className={`${BTN} inline-flex items-center gap-1.5`}
        onClick={() => setForm({ mode: 'create' })}
      >
        <IconPlus className="shrink-0" />
        {t('formats.newFormat')}
      </button>

      {form !== null ? (
        // Keyed by target so switching rows (or create→edit) remounts the form
        // with a fresh draft rather than carrying the previous one's edits.
        form.mode === 'create' ? (
          <FormatForm
            key="create"
            open
            mode="create"
            onClose={() => setForm(null)}
            controller={controller}
            existingNames={names}
            probe={probe}
          />
        ) : (
          <FormatForm
            key={`update:${form.entry.name}`}
            open
            mode="update"
            onClose={() => setForm(null)}
            controller={controller}
            existingNames={names}
            probe={probe}
            name={form.entry.name}
            current={{ kind: form.entry.kind, pattern: form.entry.pattern }}
          />
        )
      ) : null}
    </section>
  );
}
