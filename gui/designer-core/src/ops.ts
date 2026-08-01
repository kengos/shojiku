// Named patch operations: the ONLY way the Designer edits the document, each a
// serializable data value so any AI/MCP flow can express the same edit outside
// the GUI (AI parity). `applyOp` is pure over the document node — it validates
// fully BEFORE mutating, so a failure leaves the document untouched (no partial
// edit) and returns a typed `OpResult` instead of throwing.
//
// This module is the op layer's ENTRY POINT and its public surface; the layer
// splits by what an op addresses and by what can refuse it:
//
//   opTypes.ts  — the wire vocabulary (`Op`, `OpError`, `OpResult`) + the
//                 clipping/failure primitives every module below speaks;
//   snippet.ts  — what a snippet VALUE is (refused without reading the doc);
//   opTarget.ts — where an op lands, read-only (refused by the document);
//   opCreate.ts — the resolvers that CREATE the missing target (`setLeaf`,
//                 the deferred sequence auto-create);
//   keyOps.ts   — the five ops addressing a MAP KEY (`path` optional);
//   seqOps.ts   — the four ops addressing a SEQUENCE element (`path` required).

import type { Document } from 'yaml';
import { applyKeyOp } from './keyOps';
import type { Op, OpResult } from './opTypes';
import { applySeqOp } from './seqOps';

export { MAX_STRING_VALUES } from './keyOps';
export { MAX_KEY_DEPTH } from './opTarget';
export type { Op, OpError, OpErrorCode, OpResult, ScalarValue, SnippetValue } from './opTypes';
export { isSnippetValue, MAX_SNIPPET_DEPTH, MAX_SNIPPET_NODES } from './snippet';

/** Apply one operation to the document in place. The path must be valid grammar
 * (a malformed path throws `PathSyntaxError`); semantic problems — a missing
 * node, the wrong node kind, an out-of-range index, an out-of-bounds key path —
 * return an `OpError`. */
export function applyOp(doc: Document, op: Op): OpResult {
  switch (op.op) {
    case 'setScalar':
    case 'setStrings':
    case 'removeKey':
    case 'renameKey':
    case 'putValue':
      return applyKeyOp(doc, op);
    case 'moveItem':
    case 'duplicateItem':
    case 'insertItem':
    case 'removeItem':
      return applySeqOp(doc, op);
  }
}
