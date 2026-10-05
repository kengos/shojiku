// The hints a definitions field carries FOR OTHER TOOLS — `recommendedStyle`, a
// style bag an authoring tool may apply when it places the field (the engine
// never reads it), and a table's `items.title`, what one row is called.
//
// The editor writes two keys of the bag only, `textAlign` and `fontWeight: bold`,
// and MERGES them: every other key an engineer wrote there stays exactly as it
// is. Clearing the bag's last own key removes the bag, so no `{}` is left behind.
// A bag that is not a map (`recommendedStyle: right`) cannot be merged into —
// the op would be refused — so it is reported and never written. Values outside
// what the controls offer (`textAlign: justify`, `fontWeight: 600`) are shown as
// they are and survive every edit that does not replace them.

import type { Op } from '@shojiku/designer-core';
import { own, readSchemaNode, record } from './schemaNode';

const BAG = 'recommendedStyle';

/** The alignments the template style accepts (`TextAlign`,
 * engine/core/src/style/enums.rs; drift-pinned). */
export const TEXT_ALIGNS = ['left', 'center', 'right'] as const;

/** The bold spelling the template style accepts (`FontWeight`; drift-pinned). */
export const BOLD = 'bold';

export type RecommendedRead =
  | { readonly kind: 'unreadable' }
  | {
      readonly kind: 'map';
      /** Empty when unset; any authored string otherwise. */
      readonly textAlign: string;
      /** The authored `fontWeight` as text (empty when unset). */
      readonly fontWeight: string;
      /** The bag's other own keys, in authored order. */
      readonly others: readonly string[];
      /** Every own key (absent bag = none). */
      readonly keys: readonly string[];
    };

function shown(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function readRecommended(defsText: string, keysPath: readonly string[]): RecommendedRead {
  const raw = own(readSchemaNode(defsText, keysPath), BAG);
  if (raw === undefined) {
    return { kind: 'map', textAlign: '', fontWeight: '', others: [], keys: [] };
  }
  const bag = record(raw);
  if (bag === undefined) {
    return { kind: 'unreadable' };
  }
  const keys = Object.keys(bag);
  return {
    kind: 'map',
    textAlign: shown(own(bag, 'textAlign')),
    fontWeight: shown(own(bag, 'fontWeight')),
    others: keys.filter((key) => key !== 'textAlign' && key !== 'fontWeight'),
    keys,
  };
}

/** Set (`next` non-empty) or clear one key of the bag. Clearing the only key
 * the bag holds removes the bag. Null when nothing changes or the bag cannot be
 * written. */
function bagOp(
  keysPath: readonly string[],
  read: RecommendedRead,
  key: 'textAlign' | 'fontWeight',
  current: string,
  next: string,
): Op | null {
  if (read.kind !== 'map' || next === current) {
    return null;
  }
  if (next !== '') {
    return { op: 'setScalar', keys: [...keysPath, BAG, key], value: next };
  }
  const last = read.keys.length === 1 && read.keys[0] === key;
  return { op: 'removeKey', keys: last ? [...keysPath, BAG] : [...keysPath, BAG, key] };
}

/** Pick an alignment; an empty one clears it (「指定なし」). */
export function textAlignOp(
  keysPath: readonly string[],
  read: RecommendedRead,
  next: string,
): Op | null {
  return bagOp(keysPath, read, 'textAlign', read.kind === 'map' ? read.textAlign : '', next);
}

/** Turn the bold hint on (writes `bold`, replacing any other weight) or off. */
export function boldOp(keysPath: readonly string[], read: RecommendedRead, on: boolean): Op | null {
  if (read.kind !== 'map') {
    return null;
  }
  if (!on && read.fontWeight !== BOLD) {
    return null;
  }
  return bagOp(keysPath, read, 'fontWeight', read.fontWeight, on ? BOLD : '');
}

/** A table's row name (`items.title`) as shown. */
export function readRowTitle(defsText: string, tablePath: readonly string[]): string {
  const title = own(readSchemaNode(defsText, [...tablePath, 'items']), 'title');
  return typeof title === 'string' ? title : '';
}

/** Set / clear a table's row name. A table always carries `items` (that is what
 * makes it a table), so this never creates a map. */
export function rowTitleOp(tablePath: readonly string[], current: string, raw: string): Op | null {
  if (raw === current) {
    return null;
  }
  const keys = [...tablePath, 'items', 'title'];
  return raw === '' ? { op: 'removeKey', keys } : { op: 'setScalar', keys, value: raw };
}
