// The embeddable component's public surface: every host-injection point the
// Designer offers, in one place. The component itself is props-driven — nothing
// here is read from a global — so a new host is a new caller, never a change to
// the assembly.

import type { Op } from '@shojiku/designer-core';
import type { ImageCodec } from './image/import';
import type { ImageBudgets } from './image/model';
import type { SavedBlock } from './insert/blockModel';
import type { RawHostMenuEntry } from './menubar/model';
import type { SaveStatus } from './menubar/Titlebar';
import type { CopilotProvider } from './registry/copilot';
import type { ValueSynth } from './sample/synth';
import type { SampleSet } from './sample/variants';
import type { ColorScheme, ThemeOverride } from './theme/tokens';
import type { TutorialStore } from './tutorial/types';

export interface DesignerProps {
  /** Initial template YAML. The editor owns the document after mount; remount
   * (via `key`) to load a different template. */
  readonly source: string;
  /** The INITIAL sample params (JSON). The editor owns params after mount (a
   * sidebar tab edits them); remount (via `key`) to load a different document.
   * Edits re-render the preview and flow back through `onParamsChange`. When
   * `sampleSet` is provided it takes precedence — `params` then seeds only the
   * single-variant fallback for a simple host. */
  readonly params: string;
  /** The INITIAL sample-variant set (filled sample / blank / long data …). When present,
   * the preview toolbar shows a variant switcher and the sample-data panel a
   * management bar. Omit for a simple host that carries one params document —
   * the Designer then builds a one-variant set from `params`. */
  readonly sampleSet?: SampleSet;
  /** Called with the full variant set after every sample mutation (edit /
   * switch / add / remove) — the superset of `onParamsChange`, for a host that
   * persists the whole set. */
  readonly onSampleSetChange?: (set: SampleSet) => void;
  /** The definitions YAML — the BASE document the data-item editor's edits
   * apply over (the engineer's file; edits are CST-preserving ops layered on
   * top and reported through `onDefinitionsChange`). Feeds validate AND, when
   * present, the Field Palette column. When ABSENT (blank-start standalone)
   * and sample data is editable, a stub is inferred from the sample data as
   * the base instead (workshop mode). */
  readonly definitions?: string;
  /** The DOCUMENT's engine locale (`ja-JP`, …). Governs the representative UTC
   * offset a new/offset-less datetime edit attaches in the sample-data panel —
   * NOT the chrome locale (an English UI editing a ja-JP document wants JST). */
  readonly engineLocale?: string;
  /** Called with the new params JSON after every sample-data edit. */
  readonly onParamsChange?: (params: string) => void;
  /** Render the sample-data panel read-only (a mounted host's engineer-owned
   * params). Default false (standalone: editable). */
  readonly sampleDataReadOnly?: boolean;
  /** The edited definitions save to a PROJECT-scoped store (a mounted host):
   * one save changes what every template in the project validates against. The
   * data-item editor surfaces the impact scope. App-derived from the
   * definitions-save wire — the Designer never learns about hosting itself.
   * Default false (standalone: definitions ride the single local document). */
  readonly definitionsProjectScoped?: boolean;
  /** Where tutorial progress is kept between sessions. An ACCESSOR, read as
   * the launcher opens — never a boot-time snapshot. Absent → progress lasts
   * only for this session (the component assumes no browser storage). */
  readonly tutorialStore?: TutorialStore;
  /** Value synth for sample-data generation (host-injected; defaults to the
   * built-in baseline). */
  readonly synth?: ValueSynth;
  /** Called with the current EFFECTIVE definitions text so a host can persist
   * it: blank-start (workshop mode) the inferred stub with any edits folded in,
   * reported from the first inference on; with an engineer `definitions` base,
   * reported only once the user actually edits a definition (a fresh open
   * never reads as dirty). `edits` is the coalesced op list behind the text —
   * a host persists it alongside and hands it back as
   * `initialDefinitionsEdits`, so a restored session re-applies the edits over
   * the LIVE base (blank-start keeps workshop mode and its re-inference). */
  readonly onDefinitionsChange?: (definitions: string, edits?: readonly Op[]) => void;
  /** A restored session's definition-edit ops (from the host's persistence).
   * Untrusted storage: sanitized (`sanitizeDefsEdits`), and each op is
   * re-validated by designer-core at apply — a garbage op skips harmlessly. */
  readonly initialDefinitionsEdits?: readonly Op[];
  readonly scale?: number;
  /** Where a locale PACK's text comes from, so the document-settings panel can
   * say what a `defaults.locale` pick does.
   *
   * Which locale packs a deployment ships is a host fact — the standalone app
   * fetches them from its asset tree — and the engine needs the pack's bytes
   * to answer for a locale it is not rendering through. `null` means "the
   * engine has a builtin for this tag"; a rejection or an absent injection
   * means the panel explains nothing, which is the honest degradation.
   *
   * Injection point rather than a table here: the same reason fonts and the
   * image codec are injected — another host resolves them differently. */
  readonly localePacks?: {
    overlayFor(tag: string): Promise<string | null>;
  };
  /** Host-supplied `fontFamily` suggestions for the property panel (fonts the
   * host installed beyond the locale's bundled ones). */
  readonly fontFamilies?: readonly string[];
  /** The locale's default font face (the engine's `fontFamily` default) — the
   * host derives it from the active locale pack. Seeds the default-style family
   * field and floors an unset family's effective value. Absent → that field
   * shows a localized placeholder and the family floor is omitted. */
  readonly defaultFontFamily?: string;
  /** The engine's capability keys (from `capabilities`), passed to the panel
   * so it hides fields the engine lacks. Omit to show every field. */
  readonly capabilities?: readonly string[];
  /** Which built-in chrome token set to use (default `'light'`). The
   * component never reads the OS preference itself — a host resolves
   * `auto` (e.g. via matchMedia) and passes the result. */
  readonly colorScheme?: ColorScheme;
  /** Host token overrides, merged over the scheme's built-in set — the
   * theme seam (a theme is a token set; there is no theming engine). */
  readonly theme?: ThemeOverride;
  /** The editor base grid's initial step (pt; 0 = off). An EDITOR setting —
   * never written into the template; unknown values degrade to the default.
   * The user changes it via the canvas-topbar control. */
  readonly defaultGridStep?: number;
  /** Called when the user picks a grid step (the host persists it). */
  readonly onGridStepChange?: (step: number) => void;
  /** The left tool-pane's INITIAL width (px), seeded once per mount and
   * clamped to the pane bounds. An EDITOR setting — never written into the
   * template; unknown/garbage values degrade to the default. The user changes
   * it via the pane's drag handle. */
  readonly defaultSidebarWidth?: number;
  /** Called with the new pane width when the user resizes it (the host
   * persists it). */
  readonly onSidebarWidthChange?: (width: number) => void;
  /** Called with the current YAML text after every applied edit. */
  readonly onChange?: (text: string) => void;
  /** Called with the YAML text once a save-time validate finds no errors. */
  readonly onSave?: (text: string) => void;
  /** The image codec (read a File → bytes, probe raster dimensions, canvas
   * re-encode) — host-injected browser glue. Present → the insert menu's image
   * entry and canvas image drop are enabled; absent → image insertion is off. */
  readonly imageCodec?: ImageCodec;
  /** Import bounds (per-image byte/pixel caps, downscale target). Defaults to
   * the built-in budgets. */
  readonly imageBudgets?: ImageBudgets;
  /** The INITIAL template-size cap (bytes), seeded once per mount and clamped to
   * `[MAX_TEMPLATE_BYTES, MAX_TEMPLATE_BYTES_CEILING]`. Raised in-session when
   * an image nears the limit; omit for the 2 MiB default. */
  readonly templateMaxBytes?: number;
  /** Called with the new cap when the user raises it (the host persists it). */
  readonly onTemplateMaxBytesChange?: (bytes: number) => void;
  /** The document's display name for the title bar (a preset title, a mounted
   * project's template name). Omit for a simple host. */
  readonly documentName?: string;
  /** The compact save indicator for the title bar — the host maps its own save
   * lifecycle down to saving/saved (or omits it). */
  readonly saveStatus?: SaveStatus;
  /** Host/file actions surfaced in the File menu. Each is optional — its item
   * appears only when the host injects it (the imageCodec/picker gate
   * precedent). Menu items dispatch these EXISTING host callbacks only, so no
   * new document state is introduced (AI parity holds). */
  readonly menuActions?: {
    readonly onBack?: () => void;
    readonly onOpen?: () => void;
    readonly onExport?: () => void;
    /** Save the rendered PDF bytes. The Designer renders the PDF (engine) and
     * shows it; WRITING a file is the host's concern, like the YAML export.
     * Absent = the PDF action is not offered. */
    readonly onDownloadPdf?: (pdf: Uint8Array) => void;
    readonly onAddFont?: () => void;
    readonly onSnapshots?: () => void;
  };
  /** UNTRUSTED host-supplied extra menu entries, appended to the File menu.
   * Validated (id/label caps + charset, text-only render) before use; a
   * malformed entry is dropped, never thrown. */
  readonly hostMenuEntries?: readonly RawHostMenuEntry[];
  /** The saved reusable-block library — cross-document, APP-GLOBAL (unlike the
   * per-document draft), so a host that supports it owns the storage. Untrusted
   * on the way in (a host's persisted JSON); the Designer re-validates each
   * value at insert. Omit `onBlocksChange` to turn the feature off entirely. */
  readonly blocks?: readonly SavedBlock[];
  /** Persist the updated block library after a save/delete. Present → the insert
   * menu's reusable-blocks group and the save affordances are armed; absent →
   * the feature is off (a simple host with no block storage). */
  readonly onBlocksChange?: (blocks: readonly SavedBlock[]) => void;
  /** The AI-copilot transport (the `suggest:ops` hook provider): the host
   * forwards the request to its own LLM — API keys never exist in GUI code.
   * Present → the toolbar's copilot button appears; absent → the feature is
   * hidden entirely. The reply's ops are validated fail-closed and applied
   * ONLY after the user confirms them in the review pane. */
  readonly copilot?: CopilotProvider;
}
