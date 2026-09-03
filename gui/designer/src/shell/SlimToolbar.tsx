// The slim icon toolbar (one row): undo/redo, the view controls (`ViewControls`
// — grid / sample variant / zoom + the template-size indicator), and the
// selection-context format and align clusters. Insert and Save live in the
// menubar, so they are not repeated here. The left-pane collapse toggle sits in
// the sidebar's own tab row (gdoc-style), not here.
//
// Every CONTROL cluster after the first owns its LEADING `ui/Sep` rule, so a
// cluster that renders nothing takes its rule with it (gdoc-parity grouping).
// The transient notice pills at the tail are deliberately outside that rule:
// they are alerts about the document, not a group of controls, and a rule
// before one would read as another toolbar section appearing and vanishing.

import type { EditorController } from '../editor/useEditor';
import type { ChromeDialogs } from '../hooks/useChromeDialogs';
import type { Copilot } from '../hooks/useCopilot';
import type { DocDerived } from '../hooks/useDocDerived';
import type { EditorPrefs } from '../hooks/useEditorPrefs';
import type { ImageImport } from '../hooks/useImageImport';
import type { MultiSelect } from '../hooks/useMultiSelect';
import type { PreviewSession } from '../hooks/usePreviewSession';
import type { SampleData } from '../hooks/useSampleData';
import type { SaveFlow } from '../hooks/useSaveFlow';
import type { HostConfig } from '../hostConfig';
import { useI18n } from '../i18n/context';
import type { DesignerProps } from '../props';
import { AlignToolbar } from '../toolbar/AlignToolbar';
import { FormatToolbar } from '../toolbar/FormatToolbar';
import { IconButton } from '../ui/Button';
import { IconRedo, IconSparkle, IconUndo } from '../ui/icons';
import { Sep } from '../ui/Sep';
import { ViewControls } from './ViewControls';

/** The save-blocked / save-error inline notice (error palette pill). */
const SAVE_NOTICE = 'rounded-md bg-error-bg px-2 py-0.5 text-sm text-error-text';

export interface SlimToolbarProps {
  readonly editor: EditorController;
  readonly prefs: EditorPrefs;
  readonly sample: SampleData;
  readonly image: ImageImport;
  readonly multi: MultiSelect;
  readonly copilot: Copilot;
  readonly save: SaveFlow;
  readonly derived: DocDerived;
  readonly session: PreviewSession;
  readonly host: HostConfig;
  readonly dialogs: ChromeDialogs;
  readonly menuActions: DesignerProps['menuActions'];
  readonly maxBytes: number;
}

export function SlimToolbar({
  editor,
  prefs,
  sample,
  image,
  multi,
  copilot,
  save,
  derived,
  session,
  host,
  dialogs,
  menuActions,
  maxBytes,
}: SlimToolbarProps) {
  const { t } = useI18n();
  // Locals, not property reads: control-flow narrowing follows a local
  // binding, never a property read inside a deferred closure.
  const { fontFamilies, capabilities } = host;

  return (
    <div
      className="sj-slim-toolbar flex flex-wrap items-center gap-1 border-b border-border bg-chrome px-3 py-1"
      role="toolbar"
      aria-label={t('toolbar.title')}
    >
      <IconButton label={t('app.undo')} onClick={editor.undo} disabled={!editor.canUndo}>
        <IconUndo />
      </IconButton>
      <IconButton label={t('app.redo')} onClick={editor.redo} disabled={!editor.canRedo}>
        <IconRedo />
      </IconButton>
      <ViewControls
        prefs={prefs}
        sample={sample}
        image={image}
        session={session}
        host={host}
        dialogs={dialogs}
        maxBytes={maxBytes}
      />
      <FormatToolbar
        controller={editor}
        path={editor.selection}
        fontFamilies={fontFamilies}
        usage={derived.styleUsage}
        onAddFont={menuActions?.onAddFont}
        capabilities={capabilities}
        floor={derived.styleFloor}
      />
      <AlignToolbar
        count={multi.alignCount}
        onAlign={multi.doAlign}
        onDistribute={multi.doDistribute}
      />
      {copilot.copilotRun !== undefined ? (
        <>
          <Sep />
          <IconButton label={t('copilot.open')} onClick={copilot.openCopilot}>
            <IconSparkle />
          </IconButton>
        </>
      ) : null}
      {copilot.copilotNotice !== null ? (
        <output className={`block ${SAVE_NOTICE}`}>{t(copilot.copilotNotice)}</output>
      ) : null}
      {save.saveState === 'blocked' ? (
        <span role="alert" className={SAVE_NOTICE}>
          {t('app.saveBlocked')}
        </span>
      ) : null}
      {save.saveState === 'error' ? (
        <span role="alert" className={SAVE_NOTICE}>
          {t('app.saveError')}
        </span>
      ) : null}
    </div>
  );
}
