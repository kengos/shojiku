// What the mounted host's navigation IS: the view vocabulary (project list →
// template list → draft prompt → editor) and the remote reads that move between
// them. Every read has a refusal with its own `retry` closure, so the error view
// can re-enter exactly the read that failed — a mounted app talks to a real
// server, and "the fetch rejected" is a normal day, never a stuck loading view.
// `MountedApp.tsx` renders whichever view this reports.

import type { Op, ProjectDetail, ProjectSummary, TemplateEntry } from '@shojiku/designer';
import { useEffect, useRef, useState } from 'react';
import type { InstalledFont } from '../fonts/library';
import type { OpenStep } from '../loading/phase';
import type { Draft } from '../persistence/draftEnvelope';
import { docKey } from '../persistence/httpIds';
import type { AppServices, EnginePrep, PresetFiles, RemoteServices } from './services';

/** The engine locale a template entry boots when the host names none. */
export const DEFAULT_ENGINE_LOCALE = 'en-US';

/** The opened document's constant context, shared by the draft prompt and the
 * editor views. */
export interface OpenDoc {
  readonly detail: ProjectDetail;
  readonly entry: TemplateEntry;
  readonly key: string;
  readonly files: PresetFiles;
  readonly prep: EnginePrep;
  readonly docText: string;
  readonly docFonts: readonly InstalledFont[];
  readonly docRev?: string;
}

export type MountedView =
  /** A plain remote LIST read: it waits on the host, has no stages to report,
   * and keeps the one-liner. */
  | { readonly kind: 'loading' }
  /** A document OPEN: it waits on the engine module and its font packs, so it
   * gets the staged view — named by the template, and carrying the project it
   * came `from`, which is where cancelling returns (no refetch). */
  | { readonly kind: 'opening'; readonly name: string; readonly from: ProjectDetail }
  | { readonly kind: 'error'; readonly retry: () => void }
  | { readonly kind: 'projects'; readonly projects: readonly ProjectSummary[] }
  | { readonly kind: 'project'; readonly detail: ProjectDetail }
  | { readonly kind: 'draft'; readonly open: OpenDoc; readonly draft: Draft }
  | {
      readonly kind: 'editor';
      readonly open: OpenDoc;
      readonly initialText: string;
      readonly initialFonts: readonly InstalledFont[];
      readonly initialRev?: string;
      readonly initialCustomName?: string;
      /** A restored draft's edited definitions text + the ops behind it. */
      readonly initialDefinitions?: string;
      readonly initialDefinitionsEdits?: readonly Op[];
    };

export interface MountedNav {
  readonly view: MountedView;
  readonly setView: (view: MountedView) => void;
  /** What the in-flight template open has reported (font bytes, then prepared).
   * Only meaningful while `view` is `opening`. */
  readonly step: OpenStep | null;
  readonly listProjects: () => void;
  readonly openProject: (id: string) => void;
  readonly openTemplate: (detail: ProjectDetail, entry: TemplateEntry) => Promise<void>;
  /** Leave an in-flight document open for the project it came from, with the
   * open's late settling (resolve or reject) turned into a no-op. The caller
   * is the `opening` view, which carries that project — so there is no
   * "cancelled with nothing to return to" state to handle. */
  readonly cancelOpen: (from: ProjectDetail) => void;
}

export function useMountedNav(services: AppServices, remote: RemoteServices): MountedNav {
  const [view, setView] = useState<MountedView>({ kind: 'loading' });
  const [step, setStep] = useState<OpenStep | null>(null);

  const listProjects = () => {
    setView({ kind: 'loading' });
    remote.projects.listProjects().then(
      (projects) => setView({ kind: 'projects', projects }),
      () => setView({ kind: 'error', retry: listProjects }),
    );
  };

  // Load the project list once on mount; retries re-enter via the error view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate mount-once initial load (remote is constant per mount).
  useEffect(() => {
    listProjects();
  }, []);

  const openProject = (id: string) => {
    setView({ kind: 'loading' });
    remote.projects.loadProject(id).then(
      (detail) => setView({ kind: 'project', detail }),
      () => setView({ kind: 'error', retry: () => openProject(id) }),
    );
  };

  // The open GENERATION: bumped by every document open and by cancel, checked
  // after every await, so a cancelled open's late settling cannot pull the
  // user back out of the template list they returned to.
  const openSeq = useRef(0);

  const openTemplate = async (detail: ProjectDetail, entry: TemplateEntry) => {
    const seq = ++openSeq.current;
    const current = () => seq === openSeq.current;
    setStep(null);
    setView({ kind: 'opening', name: entry.name, from: detail });
    const key = docKey(detail.id, entry.id);
    try {
      const [doc, prep] = await Promise.all([
        remote.store.load(key),
        services.prepareEngine(entry.engineLocale ?? DEFAULT_ENGINE_LOCALE, (bytes) => {
          if (current()) {
            setStep({ kind: 'fonts', bytes });
          }
        }),
      ]);
      if (!current()) {
        return;
      }
      setStep({ kind: 'prepared' });
      if (doc === null) {
        setView({ kind: 'error', retry: () => void openTemplate(detail, entry) });
        return;
      }
      const open: OpenDoc = {
        detail,
        entry,
        key,
        files: {
          source: doc.text,
          params: doc.params ?? '{}',
          definitions: detail.definitions,
          assets: [],
          // Mounted sample data is engineer-owned and single — no variants.
          variants: [],
        },
        prep,
        docText: doc.text,
        docFonts: doc.fonts,
        docRev: doc.rev,
      };
      const draft = await services.drafts.load(key);
      if (!current()) {
        return;
      }
      if (draft !== null) {
        setView({ kind: 'draft', open, draft });
      } else {
        setView({
          kind: 'editor',
          open,
          initialText: doc.text,
          initialFonts: doc.fonts,
          initialRev: doc.rev,
        });
      }
    } catch {
      if (current()) {
        setView({ kind: 'error', retry: () => void openTemplate(detail, entry) });
      }
    }
  };

  const cancelOpen = (from: ProjectDetail) => {
    openSeq.current++;
    setStep(null);
    // The project detail is already in hand — no refetch for a cancel.
    setView({ kind: 'project', detail: from });
  };

  return { view, setView, step, listProjects, openProject, openTemplate, cancelOpen };
}
