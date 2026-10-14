// The definitions undo control's description: when its next step is a rename
// or a delete — which also take back the template and the sample data — it says
// which, and of what (「元に戻す: total → grand のデータ名の変更」), so the
// control never surprises anyone with how much it reverts.

import type { DefsEffect } from './defsStep';

/** The definitions undo control's description when its next step is a rename or
 * a delete: which one, and of what. */
export function undoHint(
  effect: DefsEffect | undefined,
  t: (key: string, args?: Record<string, string>) => string,
): string | undefined {
  if (effect === undefined || effect.kind === 'edit') {
    return undefined;
  }
  return effect.kind === 'rename'
    ? t('data.undoHint.rename', { from: effect.from, to: effect.to })
    : t('data.undoHint.delete', { name: effect.name });
}
