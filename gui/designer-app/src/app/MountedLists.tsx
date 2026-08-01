// The mounted host's LIST views: the project list, one project's template list,
// and the retryable failure state. All three are pure over their props — the
// reads that produce them live in `mountedNav.ts`. The two lists render the same
// pick-one-entry shape, so they share `EntryList`.

import { useI18n } from '@shojiku/designer';
import { APP_BANNER, APP_BUTTON, APP_LIST_BUTTON, APP_TITLE } from './chrome';

interface NamedEntry {
  readonly id: string;
  readonly name: string;
}

/** The pick-one shape both mounted lists render: a named entry per row, or the
 * caller's empty note. The picked ENTRY is handed back, not just its id — the
 * template list opens against the entry itself. */
function EntryList<T extends NamedEntry>({
  entries,
  emptyNote,
  onSelect,
}: {
  readonly entries: readonly T[];
  readonly emptyNote: string;
  readonly onSelect: (entry: T) => void;
}) {
  if (entries.length === 0) {
    return <p className="m-0 p-4 text-muted">{emptyNote}</p>;
  }
  return (
    <ul className="m-0 flex max-w-[460px] list-none flex-col gap-2 p-4">
      {entries.map((entry) => (
        <li key={entry.id}>
          <button type="button" className={APP_LIST_BUTTON} onClick={() => onSelect(entry)}>
            {entry.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A remote read that failed, with the retry that re-enters exactly it. */
export function MountedError({ onRetry }: { readonly onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <section className="pb-4">
      <p className={APP_BANNER} role="alert">
        {t('mounted.loadError')}
      </p>
      <button type="button" className={`${APP_BUTTON} mx-4 mt-3`} onClick={onRetry}>
        {t('mounted.retry')}
      </button>
    </section>
  );
}

export function ProjectsView<T extends NamedEntry>({
  projects,
  onOpen,
}: {
  readonly projects: readonly T[];
  readonly onOpen: (project: T) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <h1 className={APP_TITLE}>{t('mounted.projectsTitle')}</h1>
      <EntryList entries={projects} emptyNote={t('mounted.projectsEmpty')} onSelect={onOpen} />
    </>
  );
}

export function ProjectView<T extends NamedEntry>({
  name,
  templates,
  onBack,
  onOpen,
}: {
  readonly name: string;
  readonly templates: readonly T[];
  readonly onBack: () => void;
  readonly onOpen: (entry: T) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <h1 className={APP_TITLE}>{name}</h1>
      <button type="button" className={`${APP_BUTTON} mx-4`} onClick={onBack}>
        {t('mounted.backToProjects')}
      </button>
      <EntryList entries={templates} emptyNote={t('mounted.templatesEmpty')} onSelect={onOpen} />
    </>
  );
}
