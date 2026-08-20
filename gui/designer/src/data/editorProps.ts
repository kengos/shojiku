// The host-facing surface of the data-item editor, kept beside the shell so the
// props a host wires are readable without the composition around them (the same
// split the Designer's own `props.ts` uses).
//
// Optionality carries meaning here: an ABSENT callback disarms its affordance
// (no `onDefinitionEdit` = definitions are not editable at all), while a
// boolean flag narrows an armed one (`sampleDataReadOnly` on a mounted host
// keeps definitions editable while the engineer-owned params are not).

import type { Op } from '@shojiku/designer-core';
import type { FieldTarget } from '../palette/model';
import type { ValueSynth } from '../sample/synth';
import type { VariantControls } from './VariantBar';

export interface DataEditorViewProps {
  /** The EFFECTIVE definitions text (engineer file or workshop mode stub, with any
   * in-session edits already applied). Empty string = no definitions yet. */
  readonly definitions: string;
  /** The active variant's params JSON (the sample values). */
  readonly params: string;
  /** The current template YAML — the used/unused correlation reads its bindings. */
  readonly templateText: string;
  /** Report a CST-preserving definition edit (metadata set/clear, or an
   * add-field putValue). Absent = definitions not editable here. */
  readonly onDefinitionEdit?: (op: Op) => void;
  /** Report a params edit (a sample value / row change). */
  readonly onParamsChange: (params: string) => void;
  /** Sample data read-only (a mounted host's engineer-owned params). Definitions
   * stay editable regardless. */
  readonly sampleDataReadOnly?: boolean;
  /** The edited definitions save to a PROJECT-scoped store (a mounted host): one
   * save changes what every template in the project validates against. When set
   * (and definitions are editable), the editor shows the impact-scope hint. */
  readonly definitionsProjectScoped?: boolean;
  readonly synth?: ValueSynth;
  readonly locale?: string;
  /** The document engine locale — the offset a new/offset-less datetime attaches. */
  readonly engineLocale?: string;
  readonly variants?: VariantControls;
  /** Panel-local sample undo (separate from the template ⌘Z). */
  readonly canUndo?: boolean;
  readonly onUndo?: () => void;
  /** Panel-local DEFINITION undo (separate again from the sample undo + template
   * ⌘Z). Present when definitions are editable; shown in the left rail so it is
   * reachable with no field selected and stays available on a mounted host where
   * the sample is read-only but the definitions are not. */
  readonly canUndoDefinition?: boolean;
  readonly onUndoDefinition?: () => void;
  /** The template's `formats:` registry names, for the format picker. */
  /** Open with this field already selected (entered from its own gear). The
   * view mounts fresh every time it opens — `EditorBody` swaps the whole grid
   * out — so this seeds the selection once and the user is free to navigate
   * away afterwards. A target naming a field the definitions do not carry
   * simply selects nothing. */
  readonly initialSelection?: FieldTarget;
  readonly onClose: () => void;
}
