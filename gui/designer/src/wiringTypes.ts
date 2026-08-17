// The composer's result type: everything the render tree consumes, grouped by
// concern. Every field is a named bundle — the hooks' own result objects, the
// resolved host configuration, the chrome dialog flags — plus the handful of
// shared derivations the children thread; nothing is spread flat, so a shell
// child takes one prop per concern rather than a scatter of loose values.
// Kept beside `wiring.ts` so the composer file reads as the hook-call order it
// owns.

import type { Op } from '@shojiku/designer-core';
import type { CSSProperties } from 'react';
import type { TextCollision } from './diagnostics/collisions';
import type { Diagnostic } from './engine/types';
import type { useBlocks } from './hooks/useBlocks';
import type { CanvasWiring } from './hooks/useCanvasWiring';
import type { ChromeDialogs } from './hooks/useChromeDialogs';
import type { useContainerMarks } from './hooks/useContainerMarks';
import type { useCopilot } from './hooks/useCopilot';
import type { DocumentCore } from './hooks/useDocumentCore';
import type { useDocViews } from './hooks/useDocViews';
import type { useEditorPrefs } from './hooks/useEditorPrefs';
import type { useInsertActions } from './hooks/useInsertActions';
import type { useMultiSelect } from './hooks/useMultiSelect';
import type { useSaveFlow } from './hooks/useSaveFlow';
import type { useSelectionOps } from './hooks/useSelectionOps';
import type { useTutorialWiring } from './hooks/useTutorialWiring';
import type { HostConfig } from './hostConfig';

export interface DesignerWiring extends CanvasWiring {
  readonly editor: DocumentCore['editor'];
  readonly cap: DocumentCore['cap'];
  readonly sample: DocumentCore['sample'];
  readonly defs: DocumentCore['defs'];
  readonly session: DocumentCore['session'];
  readonly copilot: ReturnType<typeof useCopilot>;
  readonly prefs: ReturnType<typeof useEditorPrefs>;
  readonly multi: ReturnType<typeof useMultiSelect>;
  readonly views: ReturnType<typeof useDocViews>;
  readonly inserts: ReturnType<typeof useInsertActions>;
  readonly blocks: ReturnType<typeof useBlocks>;
  readonly selectionOps: ReturnType<typeof useSelectionOps>;
  readonly marks: ReturnType<typeof useContainerMarks>;
  readonly save: ReturnType<typeof useSaveFlow>;
  readonly tutorial: ReturnType<typeof useTutorialWiring>;
  readonly themeStyle: CSSProperties;
  readonly diagnostics: readonly Diagnostic[];
  /** What the Designer noticed that the engine is legitimately quiet about. */
  readonly advisories: readonly TextCollision[];
  readonly applyDiagnosticFix: (ops: readonly Op[]) => void;
  readonly handleParamsChange: (next: string) => void;
  /** The host configuration with every default resolved in the composer only —
   * the render tree reads this, never the raw props, so a default cannot fork.
   * (Raw untrusted host input stays out of it; see `hostConfig.ts`.) */
  readonly host: HostConfig;
  /** The Designer-local dialog flags as the bundle their hook returns. */
  readonly dialogs: ChromeDialogs;
}
