// Fonts for one editor mount: the lazy-font transport wrapper, the picked-font
// flow (picker → install into the live engine → swap transport identity so the
// preview re-renders), and the two font restores (a draft's fonts once on mount,
// a restore point's on demand).
//
// The engine's own error text never reaches the UI — only a status the chrome
// turns into a localized message (the nontech-pm persona sees no engine jargon).

import type { EngineTransport } from '@shojiku/designer';
import { useEffect, useState } from 'react';
import { createLazyFontTransport, type LazyStatus } from '../engine/lazyFonts';
import type { CatalogFamily, FontCatalog } from '../fonts/catalog';
import type { FontController } from '../fonts/controller';
import type { InstalledFont } from '../fonts/library';
import type { EnginePrep } from './services';

export type InstallStatus = 'idle' | 'installing' | 'error';

/** The narrowed picker: it exists only when the engine has the capabilities
 * (`prep.fonts`) AND the host supplies a catalog. Narrowed ONCE so the handlers
 * take the narrowed values instead of re-guarding. */
export interface FontPickerGate {
  readonly controller: FontController;
  readonly loadCatalog: () => Promise<FontCatalog>;
}

export interface FontInstallOptions {
  readonly prep: EnginePrep;
  /** A restored draft's picked fonts (empty when none). */
  readonly initialFonts: readonly InstalledFont[];
  readonly loadFontCatalog: (() => Promise<FontCatalog>) | undefined;
  /** A successful pick changed the working copy — autosave it. */
  readonly onPicked: () => void;
}

export interface FontInstall {
  /** The wrapped transport for this mount; a lazy upgrade swaps its identity
   * so the preview re-renders with the loaded fonts. */
  readonly transport: EngineTransport;
  readonly fontStatus: LazyStatus;
  readonly installStatus: InstallStatus;
  /** What the family dropdown offers: the booted locale packs' families plus
   * the picked ones (the picker's own list stays picked-only). */
  readonly offeredFamilies: readonly string[];
  /** The picked families — the picker's installed-state list. */
  readonly familyIds: readonly string[];
  readonly picker: FontPickerGate | null;
  readonly pickerOpen: boolean;
  readonly fontCatalog: FontCatalog | null;
  readonly openPicker: (load: () => Promise<FontCatalog>) => void;
  readonly closePicker: () => void;
  readonly handlePick: (controller: FontController, family: CatalogFamily) => void;
  /** Replace the picked set from a restore point, running `onDone` once the
   * reload settles (so the restored draft is not persisted with the OLD list).
   * A controller-less engine has nothing to restore and runs `onDone` at once. */
  readonly restoreFonts: (fonts: readonly InstalledFont[], onDone: () => void) => void;
}

export function useFontInstall({
  prep,
  initialFonts,
  loadFontCatalog,
  onPicked,
}: FontInstallOptions): FontInstall {
  // Picked fonts: the controller owns the state; this mirrors what the UI needs
  // (family list for the panel, installed ids for the picker) per change.
  const [familyIds, setFamilyIds] = useState<readonly string[]>(
    () => prep.fonts?.familyIds() ?? [],
  );
  const [fontStatus, setFontStatus] = useState<LazyStatus>(prep.loader.status);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fontCatalog, setFontCatalog] = useState<FontCatalog | null>(null);
  const [installStatus, setInstallStatus] = useState<InstallStatus>(
    initialFonts.length > 0 && prep.fonts !== null ? 'installing' : 'idle',
  );

  // The wrapped transport, built once for this mount's engine prep. On upgrade a
  // fresh wrapper swaps in (new identity → the preview re-renders with the
  // loaded fonts); the loader's 'upgraded' status makes further swaps no-ops.
  function makeTransport(): EngineTransport {
    return createLazyFontTransport({
      inner: prep.transport,
      loader: prep.loader,
      onUpgraded: () => setTransport(makeTransport()),
    });
  }
  const [transport, setTransport] = useState<EngineTransport>(makeTransport);

  /** Shared tail of pick + restore: reflect the controller's state into the UI
   * and re-render the preview against the reloaded store. Takes the (narrowed)
   * controller — every caller already holds one. */
  const fontsChanged = (controller: FontController) => {
    setFamilyIds(controller.familyIds());
    setTransport(makeTransport());
  };

  // Restore a draft's picked fonts once per mount. The bytes come back through
  // each manifest's pinned URL; a failure degrades to missing_glyph previews
  // behind a localized banner — the editor itself stays usable.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate mount-once restore (prep/fonts are constant per mount).
  useEffect(() => {
    const controller = prep.fonts;
    if (initialFonts.length === 0 || controller === null) {
      return;
    }
    controller.restore(initialFonts).then(
      () => {
        setInstallStatus('idle');
        fontsChanged(controller);
      },
      () => setInstallStatus('error'),
    );
  }, []);

  // Drive the loading indicator / error banner from the lazy-font loader. Only
  // the status matters for chrome — the raw engine error stays out of the UI.
  useEffect(() => {
    const { loader } = prep;
    loader.onStatusChange = (status) => {
      setFontStatus(status);
    };
    return () => {
      loader.onStatusChange = undefined;
    };
  }, [prep]);

  const openPicker = async (load: () => Promise<FontCatalog>) => {
    setPickerOpen(true);
    if (fontCatalog === null) {
      try {
        setFontCatalog(await load());
      } catch {
        setPickerOpen(false);
        setInstallStatus('error');
      }
    }
  };

  const handlePick = async (controller: FontController, family: CatalogFamily) => {
    setInstallStatus('installing');
    try {
      await controller.pick(family);
      setInstallStatus('idle');
      fontsChanged(controller);
      onPicked();
    } catch {
      setInstallStatus('error');
    }
  };

  const restoreFonts = (fonts: readonly InstalledFont[], onDone: () => void) => {
    const controller = prep.fonts;
    if (controller === null) {
      onDone();
      return;
    }
    setInstallStatus('installing');
    controller.restore(fonts).then(
      () => {
        setInstallStatus('idle');
        fontsChanged(controller);
        onDone();
      },
      () => setInstallStatus('error'),
    );
  };

  return {
    transport,
    fontStatus,
    installStatus,
    offeredFamilies: Array.from(new Set([...(prep.familyIds ?? []), ...familyIds])),
    familyIds,
    picker:
      prep.fonts !== null && loadFontCatalog !== undefined
        ? { controller: prep.fonts, loadCatalog: loadFontCatalog }
        : null,
    pickerOpen,
    fontCatalog,
    openPicker: (load) => void openPicker(load),
    closePicker: () => setPickerOpen(false),
    handlePick: (controller, family) => void handlePick(controller, family),
    restoreFonts,
  };
}
