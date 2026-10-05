// Why the last copy did not happen. ⌘D and a saved-block insert refuse a copy
// whose ids cannot all be renamed (`ids/copyIds` › `CopyRefusal`), and a
// refusal that changes nothing on the page has to SAY so — or the key press
// reads as broken. The notice is a catalog key the canvas topbar shows, and it
// clears on the next committed edit (the user has moved on).

import { useCallback, useEffect, useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import type { CopyRefusal } from '../ids/copyIds';

export interface CopyNotice {
  /** The catalog key to show, or `null`. */
  readonly copyNotice: string | null;
  readonly refuseCopy: (reason: CopyRefusal) => void;
}

export function useCopyNotice(subscribe: EditorController['subscribe']): CopyNotice {
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  useEffect(() => subscribe(() => setCopyNotice(null)), [subscribe]);
  const refuseCopy = useCallback(
    (reason: CopyRefusal) => setCopyNotice(`copy.notice.${reason}`),
    [],
  );
  return { copyNotice, refuseCopy };
}
