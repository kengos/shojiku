// The SEQUENCE half of the op surface: the four ops that address an element of
// a list by index. `path` is REQUIRED on all of them — the document root is a
// map, never a sequence. Each validates the target and the index before any
// splice, so a refusal leaves the document untouched.

import type { Document, Node } from 'yaml';
import { resolveSeqForInsert } from './opCreate';
import { inRange, resolveSeq } from './opTarget';
import { clip, fail, OK, type Op, type OpResult } from './opTypes';
import { checkSnippetValue } from './snippet';

/** The ops addressing a sequence element. */
export type SeqOp = Extract<Op, { op: 'moveItem' | 'duplicateItem' | 'insertItem' | 'removeItem' }>;

/** Apply one sequence op in place. */
export function applySeqOp(doc: Document, op: SeqOp): OpResult {
  switch (op.op) {
    case 'moveItem': {
      const resolved = resolveSeq(doc, op.path);
      if (!resolved.ok) {
        return resolved;
      }
      const { items } = resolved.seq;
      if (!inRange(op.from, items.length) || !inRange(op.to, items.length)) {
        return fail(
          'index_out_of_range',
          `move ${op.from}->${op.to} out of range for ${clip(op.path)}`,
        );
      }
      const [node] = items.splice(op.from, 1);
      items.splice(op.to, 0, node);
      return OK;
    }
    case 'duplicateItem': {
      const resolved = resolveSeq(doc, op.path);
      if (!resolved.ok) {
        return resolved;
      }
      const { items } = resolved.seq;
      if (!inRange(op.index, items.length)) {
        return fail(
          'index_out_of_range',
          `duplicate ${op.index} out of range for ${clip(op.path)}`,
        );
      }
      // Deep-copy the NODE, never a JS materialization: `clone()` keeps alias
      // nodes as aliases, so a hostile alias bomb in the subtree cannot
      // detonate the way an unbounded `toJSON()` would. Collections in a
      // parsed document hold only nodes, so the cast is total here.
      const copy = (items[op.index] as Node).clone();
      items.splice(op.index + 1, 0, copy);
      return OK;
    }
    case 'insertItem': {
      const shape = checkSnippetValue(op.value);
      if (!shape.ok) {
        return shape;
      }
      const resolved = resolveSeqForInsert(doc, op.path);
      if (!resolved.ok) {
        return resolved;
      }
      // Insertion admits index == length (append), unlike the other seq ops.
      const length = resolved.seq === null ? 0 : resolved.seq.items.length;
      if (!Number.isInteger(op.index) || op.index < 0 || op.index > length) {
        return fail(
          'index_out_of_range',
          `insert at ${op.index} out of range for ${clip(op.path)}`,
        );
      }
      // All validation passed — only now materialize (a deferred auto-create
      // keeps a failed op from leaving an empty sequence behind).
      const seq = resolved.seq ?? resolved.create();
      // The FIRST item inserted into an empty sequence authors BLOCK style (the
      // form every bundled preset uses): an authored `items: []` parses as a
      // flow sequence and the deferred auto-create also starts flow, so clearing
      // the flag on the still-empty seq makes the first insert produce
      // `items:\n  - …` instead of `items: [ … ]`. A non-empty flow sequence
      // keeps its authored form — only touched keys change.
      if (seq.items.length === 0) {
        seq.flow = false;
      }
      seq.items.splice(op.index, 0, doc.createNode(op.value));
      return OK;
    }
    case 'removeItem': {
      const resolved = resolveSeq(doc, op.path);
      if (!resolved.ok) {
        return resolved;
      }
      const { items } = resolved.seq;
      if (!inRange(op.index, items.length)) {
        return fail('index_out_of_range', `remove ${op.index} out of range for ${clip(op.path)}`);
      }
      // The emptied sequence is kept (`items: []`), never pruned — removal
      // stays reversible and a flow body with zero items is valid wire.
      items.splice(op.index, 1);
      return OK;
    }
  }
}
