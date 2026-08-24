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

import { useI18n } from '../i18n/context';
import { usageLabel } from '../i18n/usageLabel';
import { PREVIEW_CHIP, stylePreview } from '../styles/preview';
import { BTN_SM } from '../ui/chrome';
import { IconMore } from '../ui/icons';
import { Menu } from '../ui/Menu';
import { RegistryNameForm } from './RegistryNameForm';
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
            {usageCount > 0 ? usageLabel(t, usageCount) : t('styles.editHint')}
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
        <RegistryNameForm
          initial={entry.name}
          submitLabel={t('styles.rename')}
          cancelLabel={t('styles.cancel')}
          placeholder={t('styles.namePlaceholder')}
          onSubmit={actions.submitRename}
          onCancel={actions.closeRow}
        />
      ) : null}

      {active === 'confirmDelete' ? (
        <div className="sj-style-confirm mt-1 flex items-center gap-1">
          <span className="flex-1 text-sm">
            {t('styles.deleteConfirm')} {usageLabel(t, usageCount)}
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
