// What a definitions edit IS on the template's undo stack. The definitions edit
// list rides the template's history as its COMPANION (designer-core's `Editor`
// snapshots it with every entry), so one undo stack covers both documents: a
// rename — which rewrites the template, the definitions and every sample
// variant — is ONE step that one toolbar Undo takes back whole and one Redo
// re-applies. The sample data stays a document of its own (its value edits have
// their own ring), so a step records what it did to the samples as an EFFECT,
// re-applied forward or backward against the samples as they are when the
// undo/redo happens rather than restored from a snapshot that would discard a
// sample edit made since.

import type { Op } from '@shojiku/designer-core';
import type { RemovedValue } from '../sample/rekey';

/** The companion the template's history carries: the definitions edit list. */
export type DefsEdits = readonly Op[];

/** What one definitions step did, beside the edit list it leaves: a plain edit,
 * a rename (the node under `parent` went from `from` to `to`), or a delete (with,
 * per variant, the values it removed and where). Every definitions step carries
 * one, which is how the data-item editor tells that the next undo is its own. */
export type DefsEffect =
  | { readonly kind: 'edit' }
  | {
      readonly kind: 'rename';
      readonly parent: readonly string[];
      readonly from: string;
      readonly to: string;
    }
  | {
      readonly kind: 'delete';
      readonly keysPath: readonly string[];
      /** The deleted node's data name (what the undo control names). */
      readonly name: string;
      readonly variants: readonly {
        readonly id: string;
        readonly removed: readonly RemovedValue[];
      }[];
    };
