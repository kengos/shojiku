// The ONE context bundle the data-item editor's right pane hands its parts —
// field / container / root forms and the sample section — instead of a flat list
// of loose props per part. The shell builds it once per render.

import type { Op } from '@shojiku/designer-core';
import type { SampleKind, SamplePath } from '../sample/model';
import type { DefsNode } from './defsTree';
import type { RefIndex } from './refs/types';
import type { RestructureRefusal } from './renamePlan';

/** Rename / delete, armed when the definitions are editable and the host wired
 * the cascade. The shell owns the follow-ups (selection, the rail notice). */
export interface RestructureActions {
  /** The definitions save to a PROJECT-scoped store other templates share. */
  readonly projectScoped: boolean;
  /** The host manages the sample data itself: a rename / delete leaves it as it
   * is, and says so. */
  readonly sampleReadOnly: boolean;
  /** The refusal a typed name earns now (cheap — runs per keystroke). */
  readonly check: (node: DefsNode, name: string) => RestructureRefusal | null;
  /** Rename; the refusal when nothing changed. Selects the renamed node. */
  readonly rename: (node: DefsNode, name: string) => RestructureRefusal | null;
  /** Delete; selects the parent and reports in the rail. */
  readonly remove: (node: DefsNode) => void;
}

export interface DetailContext {
  /** The whole tree (the sample section asks where a field's rows live). */
  readonly tree: DefsNode;
  readonly definitions: string;
  readonly params: string;
  /** Definitions editable (an armed `onDefinitionEdit` over non-empty text). */
  readonly editable: boolean;
  /** Sample values editable (false on a mounted host's engineer-owned params). */
  readonly canEditSample: boolean;
  readonly engineLocale?: string;
  readonly onDefEdit: (op: Op | null) => void;
  readonly onCommitSample: (path: SamplePath, kind: SampleKind, raw: string) => void;
  readonly onAddRow: (arrayPath: SamplePath) => void;
  readonly onRemoveRow: (arrayPath: SamplePath, index: number) => void;
  /** Move the selection (a container's 「中の項目」 links). */
  readonly onSelect: (id: string) => void;
  /** Every data reference in the template (`null` = it could not be read). */
  readonly usage: RefIndex | null;
  readonly restructure?: RestructureActions;
}
