// The rule list's OPEN rule — Designer-local UI state (it never reaches the
// template), held as a wire index and kept on the same rule while the list
// changes under it: an applied op is remapped exactly, an undo/redo is followed
// by the list's before/after (`openRuleRemap.ts`).

import type { EditorListener } from '@shojiku/designer-core';
import { useEffect, useRef, useState } from 'react';
import type { ItemPanelProps } from './itemPanelProps';
import { followOpenRule, openAfterOps } from './openRuleRemap';
import { readRawEntries } from './rowConditionsModel';
import { rulesPath } from './ruleOrder';

export interface OpenRule {
  /** The open rule's wire index, or `null` for the list. */
  readonly open: number | null;
  readonly setOpen: (index: number | null) => void;
}

export function useOpenRule(
  controller: ItemPanelProps['controller'],
  tablePath: string,
  entries: readonly unknown[],
): OpenRule {
  const { read, subscribe } = controller;
  const [open, setOpen] = useState<number | null>(null);
  // The list as this render read it — what an undo/redo's "before" was.
  const seen = useRef(entries);
  seen.current = entries;

  useEffect(() => {
    const listPath = rulesPath(tablePath);
    const onChange: EditorListener = (change) => {
      if (change.source === 'undo' || change.source === 'redo') {
        const after = readRawEntries(read, tablePath);
        const before = seen.current;
        setOpen((at) => followOpenRule(before, after, at));
      } else {
        setOpen((at) => openAfterOps(at, change.ops, listPath));
      }
    };
    return subscribe(onChange);
  }, [read, subscribe, tablePath]);

  return { open, setOpen };
}
