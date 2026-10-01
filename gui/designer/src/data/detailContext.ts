// The ONE context bundle the data-item editor's right pane hands its parts —
// field / container / root forms and the sample section — instead of a flat list
// of loose props per part. The shell builds it once per render.

import type { Op } from '@shojiku/designer-core';
import type { SampleKind, SamplePath } from '../sample/model';
import type { DefsNode } from './defsTree';

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
}
