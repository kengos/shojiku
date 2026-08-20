// ONE `formats:` registry row: the entry's name, its kind, what it actually
// RENDERS, and how many places use it. The sample is the row's point — a
// pattern like `yyyy.MM.dd` says nothing to a reader, and 「2026.11.03」 says
// all of it — and like every sample on this surface it comes from the engine.
//
// The whole face is the click target that opens the editor; rename and delete
// are the row's overflow-menu actions, each opening one inline flow in place.
// The section above owns the plans they dispatch, so this component decides
// nothing about the document — it reports which action the user asked for.
// Every document-derived value (the name, the pattern, the sample) reaches the
// DOM as escaped React text.

import type { FormatEntry } from '../formats/model';
import { useI18n } from '../i18n/context';
import { BTN_SM } from '../ui/chrome';
import { IconMore } from '../ui/icons';
import { Menu } from '../ui/Menu';
import { RegistryNameForm } from './RegistryNameForm';

/** The inline row-menu flow open on a row. Entry editing and creation are the
 * `FormatForm` Modal, tracked by the section. */
export type FormatRowMode = 'rename' | 'confirmDelete';

export interface FormatRowActions {
  readonly openForm: () => void;
  readonly openRename: () => void;
  readonly requestDelete: () => void;
  readonly closeRow: () => void;
  readonly submitRename: (value: string) => void;
  readonly submitDelete: () => void;
}

export interface FormatRowProps {
  readonly entry: FormatEntry;
  /** How many bindings and per-type defaults name this format. */
  readonly usageCount: number;
  /** What the engine renders for this entry, or empty without a catalog. */
  readonly samples: readonly string[];
  readonly active: FormatRowMode | null;
  readonly actions: FormatRowActions;
}

export function FormatRow({ entry, usageCount, samples, active, actions }: FormatRowProps) {
  const { t } = useI18n();
  return (
    <li className="mb-1 rounded-md border border-border p-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-1 text-left text-text"
          onClick={actions.openForm}
        >
          <span className="min-w-0 truncate font-semibold">{entry.name}</span>
          <code className="shrink-0 rounded-md bg-chrome px-1 text-sm text-muted">
            {entry.kind}
          </code>
          <span className="min-w-0 truncate text-sm text-muted italic">
            {samples.length > 0 ? samples.join(' / ') : entry.pattern}
          </span>
          <span className="ml-auto shrink-0 text-sm text-muted">
            {usageCount > 0 ? t('toolbar.styles.usage', { n: usageCount }) : t('palette.unused')}
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
          placeholder={t('formats.namePlaceholder')}
          onSubmit={actions.submitRename}
          onCancel={actions.closeRow}
        />
      ) : null}

      {active === 'confirmDelete' ? (
        <div className="mt-1 flex items-center gap-1">
          {/* Deleting leaves every referring binding with NO format — the
              field's own default renders. Saying the count first is the
              shared-edit rule: impact scope before the irreversible click. */}
          <span className="flex-1 text-sm">
            {t('formats.deleteConfirm')} {t('toolbar.styles.usage', { n: usageCount })}
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
