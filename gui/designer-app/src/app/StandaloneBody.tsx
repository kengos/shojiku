// The standalone body: the preset navigation (catalog → draft prompt →
// editor), the sibling of `MountedApp`'s project navigation. The shell in
// `App.tsx` hosts whichever of the two the injected services select; everything
// per-document below it is `EditorScreen`; the view vocabulary and the open
// flow live in `standaloneNav.ts` (the `mountedNav.ts` split).

import { type ColorScheme, useI18n } from '@shojiku/designer';
import { CatalogView } from '../catalog/CatalogView';
import { catalogFor, presetDisplayName } from '../catalog/catalog';
import { LoadingView } from '../loading/LoadingView';
import type { ModuleLoad } from '../loading/moduleLoad';
import { phaseOf } from '../loading/phase';
import type { HeaderDoc } from './AppHeader';
import { APP_TITLE } from './chrome';
import { DraftPrompt } from './DraftPrompt';
import { EditorScreen } from './EditorScreen';
import type { AppServices } from './services';
import { useStandaloneNav } from './standaloneNav';

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
  const { view, setView, step, choose, cancelOpen } = useStandaloneNav(services, locale);

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
    return <LoadingView name={view.name} phase={phaseOf(engineLoad, step)} onBack={cancelOpen} />;
  }
  return (
    <>
      <h1 className={APP_TITLE}>{t('catalog.title')}</h1>
      <CatalogView entries={catalogFor(services.presets, locale)} onSelect={choose} />
    </>
  );
}
