// The mounted host's body: project list → template list → editor, over the
// injected remote provider (the documented HTTP contract behind the host's
// reverse proxy). Every remote read has a localized failure state with a
// retry — a mounted app talks to a real server, so "the fetch rejected" is a
// normal day, never a stuck loading view. Edits autosave to the LOCAL draft
// store (crash recovery, keyed `<projectId>/<templateId>`); explicit saves go
// to the host through the provider seam (EditorScreen's `saveTarget`).
//
// This file is the render tree only: the reads and the view vocabulary live in
// `mountedNav.ts`, the list/error views in `MountedLists.tsx`.

import type { ColorScheme } from '@shojiku/designer';
import { useI18n } from '@shojiku/designer';
import { LoadingView } from '../loading/LoadingView';
import type { ModuleLoad } from '../loading/moduleLoad';
import { phaseOf } from '../loading/phase';
import type { HeaderDoc } from './AppHeader';
import { DraftPrompt } from './DraftPrompt';
import { EditorScreen } from './EditorScreen';
import { MountedError, ProjectsView, ProjectView } from './MountedLists';
import { DEFAULT_ENGINE_LOCALE, useMountedNav } from './mountedNav';
import type { AppServices, RemoteServices } from './services';

export interface MountedAppProps {
  readonly services: AppServices;
  readonly remote: RemoteServices;
  readonly scheme: ColorScheme;
  /** The app-global module transfer — the first thing a template open waits on. */
  readonly engineLoad: ModuleLoad;
  /** Reports the open template's name + save status to the app header. */
  readonly onHeaderDocChange: (doc: HeaderDoc | null) => void;
}

export function MountedApp({
  services,
  remote,
  scheme,
  engineLoad,
  onHeaderDocChange,
}: MountedAppProps) {
  const { t } = useI18n();
  const { view, setView, step, listProjects, openProject, openTemplate } = useMountedNav(
    services,
    remote,
  );

  if (view.kind === 'loading') {
    // A document open goes through the same staged view as a standalone preset
    // open; a plain list read has no stages to report, so it keeps the one-liner.
    return view.opening !== null ? (
      <LoadingView name={view.opening} phase={phaseOf(engineLoad, step)} />
    ) : (
      <p className="m-0 p-4 text-muted">{t('mounted.loading')}</p>
    );
  }
  if (view.kind === 'error') {
    return <MountedError onRetry={view.retry} />;
  }
  if (view.kind === 'projects') {
    return <ProjectsView projects={view.projects} onOpen={(project) => openProject(project.id)} />;
  }
  if (view.kind === 'project') {
    const { detail } = view;
    return (
      <ProjectView
        name={detail.name}
        templates={detail.templates}
        onBack={listProjects}
        onOpen={(entry) => void openTemplate(detail, entry)}
      />
    );
  }
  if (view.kind === 'draft') {
    const { open, draft } = view;
    return (
      <DraftPrompt
        onRestore={() =>
          setView({
            kind: 'editor',
            open,
            initialText: draft.text,
            initialFonts: draft.fonts,
            // A draft made against this document carries the revision it was
            // based on; an older (pre-rev) draft falls back to the host's
            // current token — best effort under last-write-wins.
            initialRev: draft.rev ?? open.docRev,
            initialCustomName: draft.name,
            initialDefinitions: draft.definitions,
            initialDefinitionsEdits: draft.definitionsEdits,
          })
        }
        onDiscard={() => {
          services.drafts.clear(open.key);
          setView({
            kind: 'editor',
            open,
            initialText: open.docText,
            initialFonts: open.docFonts,
            initialRev: open.docRev,
          });
        }}
      />
    );
  }
  const { open } = view;
  return (
    <EditorScreen
      key={open.key}
      services={services}
      docKey={open.key}
      engineLocale={open.entry.engineLocale ?? DEFAULT_ENGINE_LOCALE}
      files={open.files}
      prep={open.prep}
      initialText={view.initialText}
      initialFonts={view.initialFonts}
      initialRev={view.initialRev}
      initialCustomName={view.initialCustomName}
      // Only a RESTORED draft seeds edited definitions; a fresh open leaves this
      // undefined so the Designer's base falls to the engineer file
      // (`files.definitions`) and stays pristine until the user edits.
      initialDefinitions={view.initialDefinitions}
      initialDefinitionsEdits={view.initialDefinitionsEdits}
      saveTarget={remote.store}
      definitionsTarget={remote.definitions}
      projectId={open.detail.id}
      initialDefinitionsRev={open.detail.definitionsRev}
      colorScheme={scheme}
      documentName={open.entry.name}
      onHeaderDocChange={onHeaderDocChange}
      // Re-fetch the project on back so a host-honored rename shows fresh in the
      // template list (the entry name is host-authoritative on reopen).
      onBack={() => openProject(open.detail.id)}
    />
  );
}
