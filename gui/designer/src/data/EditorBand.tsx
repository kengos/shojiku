// The one-line band at the top of the data-item editor's right pane saying what
// the definitions being edited ARE, when that changes what an edit means:
// project-shared (a save reaches every template in the project — the impact scope
// shown BEFORE the edit) or inferred from the sample data (workshop mode). The
// two cannot meet in practice (a project-scoped host supplies its definitions);
// shared wins if they ever do, since it is the wider impact.

import { useI18n } from '../i18n/context';

export function EditorBand({
  projectScoped,
  inferred,
}: {
  readonly projectScoped: boolean;
  readonly inferred: boolean;
}) {
  const { t } = useI18n();
  if (projectScoped) {
    return (
      <p className="m-0 rounded-md bg-warn-bg px-3 py-1.5 text-sm text-warn-text">
        {t('data.projectScopeHint')}
      </p>
    );
  }
  return inferred ? (
    <p className="m-0 rounded-md border border-border bg-chrome px-3 py-1.5 text-sm text-muted">
      {t('data.band.workshop')}
    </p>
  ) : null;
}
