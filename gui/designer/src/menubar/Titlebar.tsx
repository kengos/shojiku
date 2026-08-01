// The title bar above the menubar: the open document's name and a compact save
// indicator. The name is the host's (a preset's localized title, a mounted
// project's template name); the save status mirrors the host's persistence
// lifecycle (saving / saved) — the detailed error banners stay with the host.
// Both are host-injected props; the component renders text only (auto-escaped).
// A host that surfaces the document name in its OWN chrome (the standalone app
// carries it in its header) passes neither prop — the bar then renders nothing
// at all, so no empty bordered row appears above the menubar.

import { useI18n } from '../i18n/context';

/** The compact save lifecycle the title bar shows — the host maps its richer
 * save state down to these (or omits it). */
export type SaveStatus = 'saving' | 'saved';

export interface TitlebarProps {
  /** The open document's display name; omitted for a simple host. */
  readonly documentName?: string;
  /** The compact save indicator; omitted shows nothing. */
  readonly saveStatus?: SaveStatus;
}

export function Titlebar({ documentName, saveStatus }: TitlebarProps) {
  const { t } = useI18n();
  // Nothing to show → no bar (and no border): a host that owns the document
  // name elsewhere must not get an empty row here.
  if (documentName === undefined && saveStatus === undefined) {
    return null;
  }
  return (
    <div className="flex items-center gap-3 border-b border-border bg-chrome px-3 py-1.5 text-sm">
      {documentName !== undefined ? (
        <span className="truncate font-semibold text-text">{documentName}</span>
      ) : null}
      {saveStatus !== undefined ? (
        <output className="shrink-0 text-muted">
          {t(saveStatus === 'saving' ? 'title.saving' : 'title.saved')}
        </output>
      ) : null}
    </div>
  );
}
