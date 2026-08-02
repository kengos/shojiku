// ONE registry row: what the row OFFERS. The face is the surface's POINT — the
// name rendered through `stylePreview` on the shared paper tint (the same look
// the toolbar's style picker shows), and the whole face is the click target that
// opens the editor. A style nothing references invites a click rather than
// reporting "unused": on a blank document that badge was the whole list.
//
// Rename and delete are the row's overflow-menu actions, each opening one
// inline flow in place (`RowMode`); the section above owns the plans they
// dispatch, so this component decides nothing about the document — it reports
// which action the user asked for. Every document-derived value (the name)
// reaches the DOM as escaped text, and its look only ever through the CSSOM
// object props `stylePreview` returns, never string-built CSS.

import { type FormEvent, useState } from 'react';
import { useI18n } from '../i18n/context';
import { PREVIEW_CHIP, stylePreview } from '../styles/preview';
import { BTN_SM, INPUT } from '../ui/chrome';
import { IconMore } from '../ui/icons';
import { Menu } from '../ui/Menu';
import type { StyleEntry } from './stylesModel';

/** The inline row-menu flow open on a row (rename / delete-confirm). Field
 * editing and creation are the `StyleForm` Modal, tracked by the section. */
export type RowMode = 'rename' | 'confirmDelete';

/** What a row can ask the section to do. Grouped so the row takes a handful of
 * named inputs rather than a flat scatter of callbacks. */
export interface StyleRowActions {
  /** Open the field-editing Modal seeded from this style. */
  readonly openForm: () => void;
  /** Open the inline rename form. */
  readonly openRename: () => void;
  /** Delete — straight through when unused, via the confirm strip otherwise. */
  readonly requestDelete: () => void;
  /** Close whichever inline flow is open. */
  readonly closeRow: () => void;
  readonly submitRename: (value: string) => void;
  readonly submitDelete: () => void;
}

export interface StyleRowProps {
  readonly entry: StyleEntry;
  /** How many items reference this style (0 → the edit invitation instead). */
  readonly usageCount: number;
  /** The row's open secondary flow, or `null` when only the face shows. */
  readonly active: RowMode | null;
  readonly actions: StyleRowActions;
}

export function StyleRow({ entry, usageCount, active, actions }: StyleRowProps) {
  const { t } = useI18n();
  return (
    <li className="mb-1 rounded-md border border-border p-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-1 text-left text-text"
          onClick={actions.openForm}
        >
          {/* The name in an approximation of its own style — what the row is
              FOR. Every value reaches the DOM as a CSSOM object prop through
              `stylePreview`, never string-built CSS. */}
          <span
            className={`${PREVIEW_CHIP} min-w-0 truncate px-1.5 py-0.5`}
            style={stylePreview(entry.style)}
          >
            {entry.name}
          </span>
          <span className="ml-auto shrink-0 text-sm text-muted">
            {usageCount > 0 ? t('toolbar.styles.usage', { n: usageCount }) : t('styles.editHint')}
          </span>
        </button>
        <Menu
          label={t('styles.rowMenu', { name: entry.name })}
          trigger={<IconMore />}
          groups={[
            {
              entries: [
                { id: 'rename', label: t('styles.rename') },
                { id: 'delete', label: t('styles.delete') },
              ],
            },
          ]}
          onSelect={(id) => {
            if (id === 'rename') {
              actions.openRename();
            } else {
              actions.requestDelete();
            }
          }}
        />
      </div>

      {active === 'rename' ? (
        <NameForm
          initial={entry.name}
          submitLabel={t('styles.rename')}
          placeholder={t('styles.namePlaceholder')}
          onSubmit={actions.submitRename}
          onCancel={actions.closeRow}
          cancelLabel={t('styles.cancel')}
        />
      ) : null}

      {active === 'confirmDelete' ? (
        <div className="sj-style-confirm mt-1 flex items-center gap-1">
          <span className="flex-1 text-sm">
            {t('styles.deleteConfirm')} {t('toolbar.styles.usage', { n: usageCount })}
          </span>
          <button type="button" className={BTN_SM} onClick={actions.submitDelete}>
            {t('styles.confirm')}
          </button>
          <button type="button" className={BTN_SM} onClick={actions.closeRow}>
            {t('styles.cancel')}
          </button>
        </div>
      ) : null}
    </li>
  );
}

/** A single-field name form (rename): a controlled input committing on submit
 * (Enter or the button), with a cancel. The controlled value holds keystrokes
 * without re-serializing the document; the instance unmounts when its row
 * closes, so it reseeds on the next open. */
function NameForm({
  initial,
  submitLabel,
  placeholder,
  onSubmit,
  onCancel,
  cancelLabel,
}: {
  readonly initial: string;
  readonly submitLabel: string;
  readonly placeholder: string;
  readonly onSubmit: (value: string) => void;
  readonly onCancel: () => void;
  readonly cancelLabel: string;
}) {
  const [value, setValue] = useState(initial);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(value);
  };
  // Stacked, not one flex row: a `w-full` input beside the buttons squeezed the
  // submit label into a mid-word wrap at the widths the document-settings
  // section rail leaves. Input full-width above, buttons in their own row below
  // (each `shrink-0 whitespace-nowrap`, so a label never wraps).
  return (
    <form className="mt-1 flex flex-col gap-1" onSubmit={submit}>
      <input
        type="text"
        className={INPUT}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => setValue(event.currentTarget.value)}
      />
      <div className="flex items-center gap-1">
        <button type="submit" className={`${BTN_SM} shrink-0 whitespace-nowrap`}>
          {submitLabel}
        </button>
        <button type="button" className={`${BTN_SM} shrink-0 whitespace-nowrap`} onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </form>
  );
}
