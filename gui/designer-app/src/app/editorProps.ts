// The editor screen's host-injection surface in one file, so the screen itself
// reads as the render tree and `editorWiring.ts` as the wiring order. Mirrors
// the Designer's own `props.ts` split.

import type {
  ColorScheme,
  DefinitionsStore,
  Op,
  StoredSampleSet,
  TemplateStore,
} from '@shojiku/designer';
import type { InstalledFont } from '../fonts/library';
import type { HeaderDoc } from './AppHeader';
import type { AppServices, EnginePrep, PresetFiles } from './services';

export interface EditorScreenProps {
  readonly services: AppServices;
  /** The document's draft/export key (the preset id in standalone;
   * `<projectId>/<templateId>` on a mounted host). */
  readonly docKey: string;
  /** The document's engine locale — the export overlay's file stem. */
  readonly engineLocale: string;
  readonly files: PresetFiles;
  readonly prep: EnginePrep;
  readonly initialText: string;
  /** A restored draft's picked fonts (empty when none). */
  readonly initialFonts?: readonly InstalledFont[];
  /** A restored draft's sample-variant set; absent = built fresh from the
   * preset's `params.json` + declared variants. */
  readonly initialSample?: StoredSampleSet;
  /** A restored draft's EFFECTIVE definitions text (the workshop mode stub or the
   * engineer file with edits folded in) — seeds the dirty/export bookkeeping. */
  readonly initialDefinitions?: string;
  /** A restored draft's definition-edit ops — handed back to the Designer so
   * the edits re-apply over the LIVE base (blank-start keeps workshop mode). */
  readonly initialDefinitionsEdits?: readonly Op[];
  /** The resolved chrome scheme, passed through to the Designer. */
  readonly colorScheme?: ColorScheme;
  /** Where an explicit save lands (the mounted host's provider). Absent =
   * standalone: an explicit save persists the local draft, as ever. */
  readonly saveTarget?: TemplateStore;
  /** Where an EXPLICIT save writes edited definitions (the mounted host). Absent
   * = definitions are not host-persisted (standalone rides the local draft). */
  readonly definitionsTarget?: DefinitionsStore;
  /** The project id the definitions save addresses (mounted). */
  readonly projectId?: string;
  /** The host revision token the opened definitions were based on (mounted). */
  readonly initialDefinitionsRev?: string;
  /** The host revision token the opened document was based on (mounted). */
  readonly initialRev?: string;
  /** The document's DEFAULT display name — the preset's localized title or the
   * mounted entry name. Reported UP to the app header (which owns the gdoc-style
   * title stack), not shown in the Designer's own title bar. A rename overrides
   * it locally; in STANDALONE, committing this exact value reverts to it (so the
   * title keeps following the UI locale until the user renames) — mounted keeps
   * every committed name explicit on the save wire. */
  readonly documentName?: string;
  /** A restored draft's user rename (absent = follow `documentName`). */
  readonly initialCustomName?: string;
  /** Reports the open document's name + save status to the app shell's header,
   * and clears it (null) on unmount. */
  readonly onHeaderDocChange?: (doc: HeaderDoc | null) => void;
  readonly onBack: () => void;
}
