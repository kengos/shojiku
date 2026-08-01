// The left tool pane: the layer tree, the optional field palette, and the
// resize/collapse chrome around them. Collapsed it becomes a narrow rail
// carrying only the re-open control, so a hidden pane is always one click from
// returning.

import type { EditorController } from '../editor/useEditor';
import type { EditorPrefs } from '../hooks/useEditorPrefs';
import type { PaletteDragWiring } from '../hooks/usePaletteDrag';
import type { TutorialWiring } from '../hooks/useTutorialWiring';
import { useI18n } from '../i18n/context';
import { FieldPalette } from '../palette/FieldPalette';
import { Sidebar, type SidebarTab } from '../sidebar/Sidebar';
import { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from '../sidebar/width';
import { LayerTree } from '../tree/LayerTree';
import type { TreeView } from '../tree/model';
import { IconButton } from '../ui/Button';
import { IconPanelLeft } from '../ui/icons';
import { ResizeHandle } from '../ui/ResizeHandle';

export interface SidePaneProps {
  readonly editor: EditorController;
  readonly prefs: EditorPrefs;
  readonly treeView: TreeView | null;
  /** The palette reads the EFFECTIVE definitions — the engineer schema, the
   * workshop mode stub, or any in-session definition edits — so it works
   * blank-start. Undefined = no data tab at all. */
  readonly effectiveDefinitions: string | undefined;
  readonly paletteDrag: PaletteDragWiring['paletteDrag'];
  readonly uiEvent: TutorialWiring['uiEvent'];
  readonly onContextMenu: (path: string, x: number, y: number) => void;
  readonly onOpenDocument: () => void;
  readonly onOpenDataEditor: () => void;
}

export function SidePane({
  editor,
  prefs,
  treeView,
  effectiveDefinitions,
  paletteDrag,
  uiEvent,
  onContextMenu,
  onOpenDocument,
  onOpenDataEditor,
}: SidePaneProps) {
  const { t } = useI18n();

  if (prefs.sidebarCollapsed) {
    // The collapsed rail: a slim strip carrying only the expand control, so a
    // hidden pane is always one click from returning (no reliance on a toolbar
    // toggle the user has to hunt for).
    return (
      <div className="flex min-h-0 flex-col items-center border-r border-border bg-chrome py-2">
        <IconButton
          label={t('sidebar.expand')}
          variant="ghost"
          onClick={() => prefs.setSidebarCollapsed(false)}
        >
          <IconPanelLeft />
        </IconButton>
      </div>
    );
  }

  const tabs: SidebarTab[] = [
    {
      id: 'layers',
      label: t('sidebar.layers'),
      content: (
        <LayerTree
          view={treeView}
          selection={editor.selection}
          onSelect={editor.select}
          apply={editor.apply}
          onContextMenu={onContextMenu}
          onOpenDocument={onOpenDocument}
        />
      ),
    },
  ];
  // The palette's gear opens the fullscreen data-item editor (where the sample
  // data and the definitions themselves are edited); the old sample-data tab
  // is retired (its job moved into that editor).
  if (effectiveDefinitions !== undefined) {
    tabs.push({
      id: 'data',
      label: t('sidebar.data'),
      content: (
        <FieldPalette
          definitions={effectiveDefinitions}
          templateText={editor.text}
          onSelect={editor.select}
          drag={paletteDrag}
          onOpenEditor={onOpenDataEditor}
        />
      ),
    });
  }

  return (
    <div className="relative flex min-h-0 min-w-0">
      <Sidebar
        tabs={tabs}
        onTabChange={(id) => {
          if (id === 'data') {
            uiEvent('tab:data');
          }
        }}
        trailing={
          <IconButton
            label={t('sidebar.collapse')}
            variant="ghost"
            onClick={() => prefs.setSidebarCollapsed(true)}
          >
            <IconPanelLeft />
          </IconButton>
        }
      />
      <ResizeHandle
        width={prefs.sidebarWidth}
        min={MIN_SIDEBAR_WIDTH}
        max={MAX_SIDEBAR_WIDTH}
        onResize={prefs.setSidebarWidth}
        onCommit={prefs.commitSidebarWidth}
        label={t('sidebar.resize')}
        className="absolute inset-y-0 -right-[3px] z-10 w-1.5"
      />
    </div>
  );
}
