// The editor's top chrome: title bar, menubar, the offered tutorial strip, and
// the slim icon toolbar. The menubar columns come from `topMenubar` (which also
// validates the untrusted host entries) and the toolbar row is `SlimToolbar`;
// this file is the stack that orders them.

import type { EditorController } from '../editor/useEditor';
import type { Blocks } from '../hooks/useBlocks';
import type { ChromeDialogs } from '../hooks/useChromeDialogs';
import type { Copilot } from '../hooks/useCopilot';
import type { DocDerived } from '../hooks/useDocDerived';
import type { DocViews } from '../hooks/useDocViews';
import type { EditorPrefs } from '../hooks/useEditorPrefs';
import type { ImageImport } from '../hooks/useImageImport';
import type { InsertActions } from '../hooks/useInsertActions';
import type { MultiSelect } from '../hooks/useMultiSelect';
import type { PdfAction } from '../hooks/usePdfAction';
import type { PreviewSession } from '../hooks/usePreviewSession';
import type { SampleData } from '../hooks/useSampleData';
import type { SaveFlow } from '../hooks/useSaveFlow';
import type { SelectionOps } from '../hooks/useSelectionOps';
import type { TutorialWiring } from '../hooks/useTutorialWiring';
import type { HostConfig } from '../hostConfig';
import { useI18n } from '../i18n/context';
import type { InsertGroup } from '../insert/insertMenu';
import { Menubar } from '../menubar/Menubar';
import type { RawHostMenuEntry } from '../menubar/model';
import { type SaveStatus, Titlebar } from '../menubar/Titlebar';
import type { DesignerProps } from '../props';
import { IconButton } from '../ui/Button';
import { IconClose } from '../ui/icons';
import { SlimToolbar } from './SlimToolbar';
import { useMenubarColumns } from './topMenubar';

export interface TopChromeProps {
  readonly editor: EditorController;
  readonly documentName: string | undefined;
  readonly saveStatus: SaveStatus | undefined;
  readonly menuActions: DesignerProps['menuActions'];
  /** RAW host input — `topMenubar` validates it; nothing else may read it. */
  readonly hostMenuEntries: readonly RawHostMenuEntry[] | undefined;
  readonly maxBytes: number;
  readonly insertGroups: readonly InsertGroup[];
  readonly prefs: EditorPrefs;
  readonly sample: SampleData;
  readonly image: ImageImport;
  readonly inserts: InsertActions;
  readonly blocks: Blocks;
  readonly selectionOps: SelectionOps;
  readonly multi: MultiSelect;
  readonly copilot: Copilot;
  readonly save: SaveFlow;
  readonly tutorial: TutorialWiring;
  readonly views: DocViews;
  readonly pdf: PdfAction;
  readonly derived: DocDerived;
  /** The preview half of the editing session (the zoom control's state). */
  readonly session: PreviewSession;
  /** The resolved host configuration (defaults already applied). */
  readonly host: HostConfig;
  /** The Designer-local dialog flags. */
  readonly dialogs: ChromeDialogs;
}

export function TopChrome({
  editor,
  documentName,
  saveStatus,
  menuActions,
  hostMenuEntries,
  maxBytes,
  insertGroups,
  prefs,
  sample,
  image,
  inserts,
  blocks,
  selectionOps,
  multi,
  copilot,
  save,
  tutorial,
  views,
  pdf,
  derived,
  session,
  host,
  dialogs,
}: TopChromeProps) {
  const { t } = useI18n();

  const menubarColumns = useMenubarColumns({
    editor,
    menuActions,
    hostMenuEntries,
    insertGroups,
    inserts,
    image,
    blocks,
    selectionOps,
    save,
    pdf,
    views,
    tutorial,
    dialogs,
  });

  return (
    <>
      <Titlebar documentName={documentName} saveStatus={saveStatus} />
      <Menubar columns={menubarColumns} />
      {/* Offered, never imposed, and never floating: a strip in normal flow
          under the menubar cannot cover the controls it is talking about. */}
      {tutorial.showTutorialHint ? (
        <div className="flex items-center justify-between gap-2 border-border border-b bg-chrome px-3 py-1.5 text-sm">
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-left text-accent underline"
            onClick={tutorial.openTutorial}
          >
            {t('tutorial.hint')}
          </button>
          <IconButton
            label={t('tutorial.hintDismiss')}
            variant="ghost"
            onClick={tutorial.tutorial.dismissHint}
          >
            <IconClose />
          </IconButton>
        </div>
      ) : null}
      <SlimToolbar
        editor={editor}
        prefs={prefs}
        sample={sample}
        image={image}
        multi={multi}
        copilot={copilot}
        save={save}
        derived={derived}
        session={session}
        host={host}
        dialogs={dialogs}
        menuActions={menuActions}
        maxBytes={maxBytes}
      />
    </>
  );
}
