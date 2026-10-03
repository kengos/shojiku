// The definitions undo control's description: when its next step is a rename
// or a delete — which also take back the template and the sample data — it says
// which, and of what (「元に戻す: total → grand のデータ名の変更」), so the
// control never surprises anyone with how much it reverts.

import type { DefsCompanion } from './defsHistory';

/** The definitions undo control's description when its next step is a rename or
 * a delete: which one, and of what. */
export function undoHint(
  companion: DefsCompanion | undefined,
  t: (key: string, args?: Record<string, string>) => string,
): string | undefined {
  if (companion === undefined) {
    return undefined;
  }
  return companion.kind === 'rename'
    ? t('data.undoHint.rename', {
        from: companion.name,
        to: companion.keysPath.slice(-1).join(''),
      })
    : t('data.undoHint.delete', { name: companion.name });
}
