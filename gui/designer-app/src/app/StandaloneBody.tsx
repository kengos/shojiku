// The standalone body: the preset navigation (catalog → draft prompt →
// editor), the sibling of `MountedApp`'s project navigation. The shell in
// `App.tsx` hosts whichever of the two the injected services select; everything
// per-document below it is `EditorScreen`.

import {
  type ColorScheme,
  type PresetContribution,
  type StoredSampleSet,
  useI18n,
} from '@shojiku/designer';
import { useState } from 'react';
import { CatalogView } from '../catalog/CatalogView';
import { catalogFor, presetDisplayName } from '../catalog/catalog';
import type { InstalledFont } from '../fonts/library';
import { LoadingView } from '../loading/LoadingView';
import type { ModuleLoad } from '../loading/moduleLoad';
import { type OpenStep, phaseOf } from '../loading/phase';
import type { Draft } from '../persistence/draftEnvelope';
import type { HeaderDoc } from './AppHeader';
import { APP_TITLE } from './chrome';
import { DraftPrompt } from './DraftPrompt';
import { EditorScreen } from './EditorScreen';
import type { AppServices, EnginePrep, PresetFiles } from './services';

type View =
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

export interface StandaloneBodyProps {
  readonly services: AppServices;
  readonly locale: string;
  readonly scheme: ColorScheme;
  /** The app-global module transfer — the first thing a preset open waits on. */
  readonly engineLoad: ModuleLoad;
  readonly onHeaderDocChange: (doc: HeaderDoc | null) => void;
}

export function StandaloneBody({
  services,
  locale,
  scheme,
  engineLoad,
  onHeaderDocChange,
}: StandaloneBodyProps) {
  const { t } = useI18n();
  const { drafts } = services;
  const [view, setView] = useState<View>({ kind: 'catalog' });
  // What the in-flight open has reported. Only ever READ while the view is
  // `loading`, so a report left over from a previous open is inert; each open
  // resets it before anything can report.
  const [step, setStep] = useState<OpenStep | null>(null);

  const choose = async (preset: PresetContribution) => {
    setStep(null);
    setView({ kind: 'loading', name: presetDisplayName(preset, locale) });
    let files: PresetFiles;
    let prep: EnginePrep;
    try {
      [files, prep] = await Promise.all([
        preset.load(),
        services.prepareEngine(preset.engineLocale, (bytes) => setStep({ kind: 'fonts', bytes })),
      ]);
    } catch {
      // A refusal (the module never arrived, a font pack will not fetch, the
      // engine will not boot) reports on the wait itself. Without this the
      // rejection was unhandled and the panel span forever — there is no
      // partially-opened document to fall back to, so the honest end state is
      // the named stage marked failed plus the remedy.
      setStep({ kind: 'failed' });
      return;
    }
    setStep({ kind: 'prepared' });
    // The preset's bundled assets ride the freshly booted engine (retained
    // across renders), so both the fresh-open and draft-restore paths see
    // them. Injected once, before any editor render.
    prep.injectAssets(files.assets);
    const draft = await drafts.load(preset.id);
    if (draft !== null) {
      setView({ kind: 'draft', preset, files, prep, draft });
    } else {
      setView({ kind: 'editor', preset, files, prep, initialText: files.source, initialFonts: [] });
    }
  };

  if (view.kind === 'editor' || view.kind === 'draft') {
    const { preset, files, prep } = view;
    if (view.kind === 'draft') {
      const { draft } = view;
      return (
        <DraftPrompt
          onRestore={() =>
            setView({
              kind: 'editor',
              preset,
              files,
              prep,
              initialText: draft.text,
              initialFonts: draft.fonts,
              initialSample: draft.sample,
              initialDefinitions: draft.definitions,
              initialCustomName: draft.name,
            })
          }
          onDiscard={() => {
            drafts.clear(preset.id);
            setView({
              kind: 'editor',
              preset,
              files,
              prep,
              initialText: files.source,
              initialFonts: [],
            });
          }}
        />
      );
    }
    return (
      <EditorScreen
        key={preset.id}
        services={services}
        docKey={preset.id}
        engineLocale={preset.engineLocale}
        files={files}
        prep={prep}
        initialText={view.initialText}
        initialFonts={view.initialFonts}
        initialSample={view.initialSample}
        initialDefinitions={view.initialDefinitions}
        initialCustomName={view.initialCustomName}
        colorScheme={scheme}
        documentName={presetDisplayName(preset, locale)}
        onHeaderDocChange={onHeaderDocChange}
        onBack={() => setView({ kind: 'catalog' })}
      />
    );
  }

  if (view.kind === 'loading') {
    return <LoadingView name={view.name} phase={phaseOf(engineLoad, step)} />;
  }
  return (
    <>
      <h1 className={APP_TITLE}>{t('catalog.title')}</h1>
      <CatalogView entries={catalogFor(services.presets, locale)} onSelect={choose} />
    </>
  );
}
