// What a SNIPPET value is: the shape guard `insertItem`/`putValue` run BEFORE
// any mutation. Refused by the value alone — this module never looks at the
// document, which is why the same walk also serves as the public
// `isSnippetValue` type guard for consumers that persist materialized nodes.

import { fail, OK, type OpResult, type SnippetValue } from './opTypes';

/** Maximum nesting depth of an `insertItem` snippet. The op surface is
 * AI-parity-public, so the walk must terminate on hostile input — the depth
 * bound also cuts off CYCLIC values (a cycle's depth is infinite). */
export const MAX_SNIPPET_DEPTH = 16;

/** Maximum total nodes (scalars + collections) an `insertItem` snippet may
 * carry — bounds the work and the document growth of one op. */
export const MAX_SNIPPET_NODES = 256;

/** Validate an `insertItem` snippet before any mutation: finite scalars, plain
 * maps (prototype `Object.prototype`/null — a JSON payload can produce nothing
 * else, and it keeps exotic objects out), arrays; bounded depth and total node
 * count. The depth bound is what terminates a cyclic hostile value. Mutates
 * `budget.nodes` downward across the walk.
 *
 * Threat model: the op arrives as DATA (a JSON payload cannot carry getters
 * or Proxies). In-process hostile CODE handing over a live object graph could
 * return different values between this walk and the later `createNode` read,
 * but such a caller already holds the document and needs no op to corrupt it
 * — the caps here make hostile data cheap to reject, they do not sandbox
 * hostile code. */
function checkSnippet(value: unknown, depth: number, budget: { nodes: number }): OpResult {
  if (depth > MAX_SNIPPET_DEPTH) {
    return fail('invalid_value', `snippet deeper than ${MAX_SNIPPET_DEPTH}`);
  }
  budget.nodes -= 1;
  if (budget.nodes < 0) {
    return fail('invalid_value', `snippet over ${MAX_SNIPPET_NODES} nodes`);
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return OK;
  }
  if (typeof value === 'number') {
    // Mirrors setScalar: the engine parse-rejects non-finite numbers.
    return Number.isFinite(value) ? OK : fail('invalid_value', 'non-finite number in snippet');
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = checkSnippet(entry, depth + 1, budget);
      if (!result.ok) {
        return result;
      }
    }
    return OK;
  }
  if (typeof value === 'object' && value !== null) {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      return fail('invalid_value', 'snippet map is not a plain object');
    }
    // Own enumerable entries only — a literal `__proto__` key arriving via
    // JSON.parse is an own property and lands as an ordinary YAML map key;
    // it never touches the prototype chain here.
    for (const [, entry] of Object.entries(value)) {
      const result = checkSnippet(entry, depth + 1, budget);
      if (!result.ok) {
        return result;
      }
    }
    return OK;
  }
  return fail('invalid_value', 'snippet value must be a finite scalar, array, or plain map');
}

/** Check a whole snippet from the top: a fresh node budget, depth 0. The form
 * every op takes before it mutates. */
export function checkSnippetValue(value: unknown): OpResult {
  return checkSnippet(value, 0, { nodes: MAX_SNIPPET_NODES });
}

/** Whether a value is a valid `SnippetValue` — a finite-scalar / array / plain-map
 * tree within the depth and node caps. The ONE public home for the snippet
 * shape rule (`insertItem`/`putValue` validate through the same `checkSnippet`),
 * so a consumer that persists or reuses a materialized node (the reusable-block
 * library) narrows hostile storage and over-cap subtrees the same way the op
 * layer does, without re-implementing the walk. */
export function isSnippetValue(value: unknown): value is SnippetValue {
  return checkSnippetValue(value).ok;
}
