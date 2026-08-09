// What the standalone body's navigation IS: the view vocabulary (catalog →
// loading → draft prompt → editor) and the preset-open flow that moves between
// them — the standalone sibling of `mountedNav.ts`, split along the same seam
// (`StandaloneBody.tsx` renders whichever view this reports).

import type { PresetContribution, StoredSampleSet } from '@shojiku/designer';
import { useRef, useState } from 'react';
import { presetDisplayName } from '../catalog/catalog';
import type { InstalledFont } from '../fonts/library';
import type { OpenStep } from '../loading/phase';
import type { Draft } from '../persistence/draftEnvelope';
import type { AppServices, EnginePrep, PresetFiles } from './services';

export type StandaloneView =
  | { readonly kind: 'catalog' }
  /** A preset is opening; `name` titles the wait so the user can see WHICH. */
  | { readonly kind: 'loading'; readonly name: string }
  | {
      readonly kind: 'draft';
      readonly preset: PresetContribution;
      readonly files: PresetFiles;
      readonly prep: EnginePrep;
      readonly draft: Draft;
    }
  | {
      readonly kind: 'editor';
      readonly preset: PresetContribution;
      readonly files: PresetFiles;
      readonly prep: EnginePrep;
      readonly initialText: string;
      readonly initialFonts: readonly InstalledFont[];
      readonly initialSample?: StoredSampleSet;
      readonly initialDefinitions?: string;
      readonly initialCustomName?: string;
    };

export interface StandaloneNav {
  readonly view: StandaloneView;
  readonly setView: (view: StandaloneView) => void;
  /** What the in-flight open has reported. Only ever READ while the view is
   * `loading`, so a report left over from a previous open is inert; each open
   * resets it before anything can report. */
  readonly step: OpenStep | null;
  readonly choose: (preset: PresetContribution) => Promise<void>;
  /** Leave a live or failed open for the catalog, with the open's late
   * settling (resolve or reject) turned into a no-op. */
  readonly cancelOpen: () => void;
}

export function useStandaloneNav(services: AppServices, locale: string): StandaloneNav {
  const { drafts } = services;
  const [view, setView] = useState<StandaloneView>({ kind: 'catalog' });
  const [step, setStep] = useState<OpenStep | null>(null);
  // The open GENERATION: bumped by every open and by cancel, and checked after
  // every await, so a cancelled open's late settling (resolve OR reject) can
  // never yank the user out of the catalog they backed out to.
  const openSeq = useRef(0);

  const choose = async (preset: PresetContribution) => {
    const seq = ++openSeq.current;
    const current = () => seq === openSeq.current;
    setStep(null);
    setView({ kind: 'loading', name: presetDisplayName(preset, locale) });
    try {
      const [files, prep] = await Promise.all([
        preset.load(),
        services.prepareEngine(preset.engineLocale, (bytes) => {
          if (current()) {
            setStep({ kind: 'fonts', bytes });
          }
        }),
      ]);
      if (!current()) {
        return;
      }
      setStep({ kind: 'prepared' });
      // The preset's bundled assets ride the freshly booted engine (retained
      // across renders), so both the fresh-open and draft-restore paths see
      // them. Injected once, before any editor render — and inside the try,
      // so a refusal here reports like any other instead of rejecting
      // unhandled.
      prep.injectAssets(files.assets);
      const draft = await drafts.load(preset.id);
      if (!current()) {
        return;
      }
      if (draft !== null) {
        setView({ kind: 'draft', preset, files, prep, draft });
      } else {
        setView({
          kind: 'editor',
          preset,
          files,
          prep,
          initialText: files.source,
          initialFonts: [],
        });
      }
    } catch {
      // A refusal (the module never arrived, a font pack will not fetch, the
      // engine will not boot) reports on the wait itself. Without this the
      // rejection was unhandled and the panel span forever — there is no
      // partially-opened document to fall back to, so the honest end state is
      // the named stage marked failed plus the way back.
      if (current()) {
        setStep({ kind: 'failed' });
      }
    }
  };

  const cancelOpen = () => {
    openSeq.current++;
    setStep(null);
    setView({ kind: 'catalog' });
  };

  return { view, setView, step, choose, cancelOpen };
}
