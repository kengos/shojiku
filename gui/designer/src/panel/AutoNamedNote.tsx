// The one-line note a pick that NAMED its target leaves behind. The name landed
// on ANOTHER item — one the user is not looking at — so the panel says which
// name it gave, once, right after: shown only while that picker slot (an
// ellipse's anchor, a line end) still names it, and only for the item it was
// picked on. An undo, a re-pick, or selecting another item hides it, and
// coming back to the item does not bring it back.

import { useState } from 'react';
import { useI18n } from '../i18n/context';
import type { PickedTarget } from '../ids/anchorTargets';
import { anchorLabel } from './ellipseAnchor';

interface Named {
  readonly path: string;
  readonly slot: string;
  readonly id: string;
}

export function useAutoNamed(path: string) {
  const [named, setNamed] = useState<Named | null>(null);
  const [seen, setSeen] = useState(path);
  // A selection change forgets the note — during render, React's pattern for
  // state derived from a prop, so the stale note never paints.
  if (seen !== path) {
    setSeen(path);
    setNamed(null);
  }
  return {
    record: (slot: string, picked: PickedTarget) =>
      setNamed(picked.ops.length > 0 ? { path, slot, id: picked.id } : null),
    noteFor: (slot: string, current: string) =>
      named !== null && named.path === path && named.slot === slot && named.id === current
        ? named.id
        : null,
  };
}

/** The note, or nothing. */
export function AutoNamedNote({ name }: { readonly name: string | null }) {
  const { t } = useI18n();
  return name === null ? null : (
    <p className="m-0 w-full text-muted text-xs" role="status">
      {t('panel.anchor.autoNamed', { name: anchorLabel(name) })}
    </p>
  );
}
