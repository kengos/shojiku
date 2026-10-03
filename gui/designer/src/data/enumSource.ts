// Whether a field's choices are SPELLED the way this editor would write them
// back. The member list is read through the plain-JS view, where YAML `2.0`,
// `1e3`, `0x10` and an integer past 2^53 all arrive as a JS number whose own
// spelling differs — and the engine compares members as written (`2.0` is a
// float that never equals the integer `2`). A whole-list rewrite would silently
// change such a member while the user edited ANOTHER one, so a list carrying
// one is read-only instead (`enumModel.readEnum`).
//
// Reads the parsed document's nodes by their source ranges. It runs only on a
// list `readEnum` already read as scalar / `{ value, label }` members, so the
// node shapes are known; an ALIAS (for the list or a member) has no spelling of
// its own here and counts as not canonical.

import { parseTemplate } from '@shojiku/designer-core';

interface SourceNode {
  readonly value?: unknown;
  readonly range?: readonly number[];
  readonly items?: readonly unknown[];
}

interface SourcePair {
  readonly key: SourceNode;
  readonly value: unknown;
}

function canonicalScalar(node: SourceNode, text: string): boolean {
  if (typeof node.value !== 'number') {
    return true;
  }
  const [start, end] = node.range as readonly number[];
  return text.slice(start, end).trim() === String(node.value);
}

function canonicalMember(node: unknown, text: string): boolean {
  const member = node as SourceNode;
  if (!Array.isArray(member.items)) {
    // A scalar member — or an alias, which carries no `value` of its own.
    return 'value' in member && canonicalScalar(member, text);
  }
  // A `{ value, label }` pair: only its value can be a number.
  return member.items.every((pair) => {
    const entry = pair as SourcePair;
    return entry.key.value !== 'value' || canonicalMember(entry.value, text);
  });
}

/** Whether every numeric member of the `enum` at `keysPath` is spelled as
 * `String(value)`, and the list is written out in place (not an alias). Call it
 * only for a list `readEnum` read as rows. */
export function enumSpelledCanonically(defsText: string, keysPath: readonly string[]): boolean {
  const list = parseTemplate(defsText).getIn([...keysPath, 'enum'], true) as SourceNode;
  return Array.isArray(list.items) && list.items.every((node) => canonicalMember(node, defsText));
}
