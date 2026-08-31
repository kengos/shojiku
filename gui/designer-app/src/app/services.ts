// The App's host-injection surface: every browser concern (asset fetch, engine
// transport, persistence, file open/download, locale persistence) enters as an
// injected service so the App component is pure orchestration and unit-testable
// with fakes. main.tsx builds the real services over browser globals + the
// booted wasm engine; the app is deliberately just ONE host of these.

import type {
  CopilotProvider,
  DefinitionsStore,
  EngineTransport,
  ImageCodec,
  PresetAsset,
  PresetContribution,
  ProjectSource,
  RawHostMenuEntry,
  TemplateStore,
  TutorialStore,
  ValueSynth,
} from '@shojiku/designer';
import type { LazyFontLoader } from '../engine/lazyFonts';
import type { FontCatalog } from '../fonts/catalog';
import type { FontController } from '../fonts/controller';
import type { FontPickerProps } from '../fonts/FontPicker';
import type { ExportArtifact } from '../fonts/kit';
import type { ModuleLoadSource } from '../loading/moduleLoad';
import type { ByteProgress } from '../loading/progress';
import type { BlockStore } from '../persistence/blocks';
import type { DraftStore } from '../persistence/drafts';
import type { FileLike } from '../persistence/files';
import type { SnapshotStore } from '../persistence/snapshots';
import type { SchemeMedia, ThemePreference } from '../theme/scheme';

// A preset's authored files (template / params / definitions base / bundled
// assets / sample variants) — the shape a preset contribution's `load`
// resolves; lives with the hook registry's contribution types.
export type { PresetFiles } from '@shojiku/designer';

/** A prepared engine for one preset-open: the base (unwrapped) transport over a
 * freshly booted `Engine`, its lazy-font loader (holding the absent packs), and
 * — when the engine's capabilities allow it — the picked-font controller. The
 * App wraps the transport with the lazy-font loop. Prepared per open — keyed
 * on the preset's engine locale — so switching the UI locale never strands the
 * engine on the wrong font packs. */
export interface EnginePrep {
  readonly transport: EngineTransport;
  readonly loader: LazyFontLoader;
  /** Picked-font state over this engine, or `null` when the engine lacks the
   * `fonts.face.url` / `wasm.fonts.faces` capabilities — the picker is then
   * hidden entirely (feature gate, never version sniffing). */
  readonly fonts: FontController | null;
  /** The booted locale packs' authorable `fontFamily` values (the boot
   * result's list) — the format toolbar's family dropdown offers these plus
   * the picked families. Optional so a lean host/fixture omits it. */
  readonly familyIds?: readonly string[];
  /** The locale's DEFAULT `fontFamily` (the boot result's `defaultFamily`) —
   * the Designer seeds it into the document-defaults family field and floors an
   * unset family's effective value. Optional so a lean host/fixture omits it. */
  readonly defaultFamily?: string;
  /** Inject the preset's bundled asset bytes into this engine (keyed
   * `assets/<name>`, the path the template references). Called once at
   * preset-open, after the parallel preset-load resolves — the engine
   * retains injected assets for every subsequent render. */
  readonly injectAssets: (assets: readonly PresetAsset[]) => void;
  /** The booted engine's capability keys. Threaded to the `Designer` so its
   * capability gates read the ACTUAL module: without this the component's
   * `capabilities` prop is undefined and every gate falls open — a newer GUI
   * against an older engine would then offer fields that engine cannot honor.
   * Optional so a lean host/fixture may omit it (the gates then fall open, as
   * they did before). */
  readonly capabilities?: readonly string[];
}

/** A mounted host's persistence: the project catalog plus the store explicit
 * saves go through (both sides of the documented HTTP contract; auth rides the
 * host session through the reverse proxy). Present = the app opens into the
 * project list instead of the preset catalog. */
export interface RemoteServices {
  readonly projects: ProjectSource;
  readonly store: TemplateStore;
  /** The definitions-write seam — present = the host lets the Designer edit
   * `definitions.yml`; absent = definitions stay read-only on this host. */
  readonly definitions?: DefinitionsStore;
}

export interface AppServices {
  /** The catalog presets the boot composition collected through the hook
   * registry (`init:presets` — the app's assembled catalog first, integrator
   * contributions after), each carrying its own `load`. */
  readonly presets: readonly PresetContribution[];
  /** The locale detected at startup (override > navigator > default). */
  readonly initialLocale: string;
  /** Persist a user-chosen locale. */
  readonly persistLocale: (tag: string) => void;
  /** The theme preference loaded at startup (validated; default 'auto'). */
  readonly initialThemePref: ThemePreference;
  /** Persist a user-chosen theme preference. */
  readonly persistThemePref: (pref: ThemePreference) => void;
  /** The persisted editor grid step (validated; pt, 0 = off) — a FUNCTION,
   * read per editor mount so a step picked in one document seeds the next
   * open in the same session. */
  readonly gridStep: () => number;
  /** Persist a user-chosen grid step. */
  readonly persistGridStep: (step: number) => void;
  /** The persisted template-size cap (validated bytes) — a FUNCTION, read per
   * editor mount so a cap raised in one document seeds the next open. */
  readonly templateMaxBytes: () => number;
  /** Persist a user-raised template-size cap. */
  readonly persistTemplateMaxBytes: (bytes: number) => void;
  /** The persisted left tool-pane width (validated px) — a FUNCTION, read per
   * editor mount so a width set in one document seeds the next open. */
  readonly sidebarWidth: () => number;
  /** Persist a user-chosen pane width. */
  readonly persistSidebarWidth: (width: number) => void;
  /** Where tutorial progress is kept. The Designer reads it through the store's
   * own accessor as its launcher opens, so progress written by another tab (or
   * an earlier session) is picked up rather than cached at boot. */
  readonly tutorialStore: TutorialStore;
  /** The image-import codec (read a File → bytes, probe raster dims, canvas
   * re-encode) — browser glue; absent → the Designer's image insert is off. */
  readonly imageCodec?: ImageCodec;
  /** The OS dark-scheme media source
   * (`window.matchMedia('(prefers-color-scheme: dark)')`), or null when
   * unavailable — 'auto' then renders light. */
  readonly colorSchemeMedia: SchemeMedia | null;
  /** Per-document local draft persistence (working copies in both modes). */
  readonly drafts: DraftStore;
  /** The APP-GLOBAL reusable-block library (cross-document snippet store). */
  readonly blocks: BlockStore;
  /** Per-document named restore points (local, both modes) — the working copy
   * captured under a name, separate from the autosaved draft. */
  readonly snapshots: SnapshotStore;
  /** The current wall-clock time (ms). Injected so restore-point timestamps and
   * relative-freshness display are deterministic in tests. */
  readonly now: () => number;
  /** The mounted host's persistence provider; absent = standalone. */
  readonly remote?: RemoteServices;
  /** The AI-copilot transport (the boot-collected `suggest:ops` provider);
   * absent = the Designer's copilot UI stays hidden. */
  readonly copilot?: CopilotProvider;
  /** The app-global engine-module transfer, watchable by the shell chrome.
   * Catalog-first boot renders before the module is in, so its progress (and a
   * failure to load it at all) has to be observable rather than awaited. */
  readonly moduleLoad: ModuleLoadSource;
  /** Boot a fresh engine for a preset's target locale (inject its primary font
   * packs, run the subset load) and return the transport + lazy loader.
   *
   * `onProgress` reports the font-pack transfer as it goes, so the open view can
   * show real progress on a path that moves ~18 MB on the Japanese lineup. It
   * also awaits the engine MODULE, which catalog-first boot leaves in flight —
   * so a preset opened seconds after landing waits here, not before the catalog
   * ever appears. */
  readonly prepareEngine: (
    engineLocale: string,
    onProgress?: (progress: ByteProgress) => void,
  ) => Promise<EnginePrep>;
  /** Where a locale PACK's text comes from, so the Designer's document-settings
   * panel can ask the engine what a `defaults.locale` pick DOES — including
   * for a locale this session is not rendering through. `null` from
   * `overlayFor` means "no pack to send", which covers BOTH a builtin and a
   * tag this deployment ships nothing for; the engine's refusal is what
   * separates them, and an unexplained tag is the second case. */
  readonly localePacks: { overlayFor(tag: string): Promise<string | null> };
  /** Fetch the Google-Fonts catalog snapshot (memoized by the host). Absent →
   * the font picker is not offered. */
  readonly loadFontCatalog?: () => Promise<FontCatalog>;
  /** The picker's specimen loader (FontFace over fetched bytes; browser-only). */
  readonly specimen?: FontPickerProps['specimen'];
  /** Build a locale-bound sample-data value synth for an engine locale
   * (faker-backed; dynamic-imports the faker locale). Absent → the Designer's
   * built-in baseline synth is used; a rejection degrades to it too. */
  readonly loadSynth?: (engineLocale: string) => Promise<ValueSynth>;
  /** Trigger a browser download of the composed export (plain YAML or a kit). */
  readonly exportFile: (file: ExportArtifact) => void;
  /** Prompt the user to pick a file to open; resolves `null` if cancelled. */
  readonly openFile: () => Promise<FileLike | null>;
  /** UNTRUSTED host-supplied extra menu entries for the Designer's File menu
   * (the component validates them). Absent = none (the standalone default). */
  readonly hostMenuEntries?: readonly RawHostMenuEntry[];
}
