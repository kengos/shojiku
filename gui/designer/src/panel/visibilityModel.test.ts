// The read side of `visible:`. The document is untrusted, so the interesting
// cases are all shapes an externally-authored (or hostile) file can carry
// that the engine would reject but the panel must still survive reading.

import { expect, it } from 'vitest';
import { readVisible } from './visibilityModel';

const P = 'sections.body.items[0]';

function read(item: unknown) {
  return (path: string) => (path === P ? item : undefined);
}

it('returns null when the item authors no binding', () => {
  expect(readVisible(read({ type: 'text' }), P)).toBeNull();
});

it('returns null when `visible` is not a map — there is nothing to edit', () => {
  // The engine's parse error is the honest report for these; the panel just
  // must not offer controls over them.
  for (const bad of ['yes', 42, ['a'], null]) {
    expect(readVisible(read({ visible: bad }), P)).toBeNull();
  }
});

it('reads a bare key as the boolean form', () => {
  expect(readVisible(read({ visible: { key: 'paid' } }), P)).toEqual({
    key: 'paid',
    equals: '',
    hasEquals: false,
    collapse: false,
    documentScope: false,
  });
});

it('reads every authored key', () => {
  const row = readVisible(
    read({ visible: { key: 'status', equals: 'approved', collapse: true, scope: 'document' } }),
    P,
  );
  expect(row).toEqual({
    key: 'status',
    equals: 'approved',
    hasEquals: true,
    collapse: true,
    documentScope: true,
  });
});

it('displays a numeric or boolean `equals` as text', () => {
  expect(readVisible(read({ visible: { key: 'n', equals: 2 } }), P)?.equals).toBe('2');
  expect(readVisible(read({ visible: { key: 'b', equals: false } }), P)?.equals).toBe('false');
});

it('counts an explicit null `equals` as absent — standard serde reads it as unset', () => {
  const row = readVisible(read({ visible: { key: 'k', equals: null } }), P);
  expect(row?.hasEquals).toBe(false);
  expect(row?.equals).toBe('');
});

it('reads a container `equals` as unset rather than showing an object', () => {
  // The engine rejects these at parse, so there is no value to edit — but the
  // panel is asked to render the file as it stands.
  expect(readVisible(read({ visible: { key: 'k', equals: { a: 1 } } }), P)?.equals).toBe('');
  expect(readVisible(read({ visible: { key: 'k', equals: [1, 2] } }), P)?.hasEquals).toBe(true);
});

it('degrades a non-string key to empty rather than throwing', () => {
  expect(readVisible(read({ visible: { key: 7 } }), P)?.key).toBe('');
});

it('truncates a hostile display string instead of dropping it', () => {
  const long = 'x'.repeat(200);
  const row = readVisible(read({ visible: { key: long, equals: long } }), P);
  expect(row?.key).toHaveLength(81);
  expect(row?.key.endsWith('…')).toBe(true);
  expect(row?.equals).toHaveLength(81);
});

it('treats a non-true collapse and a non-document scope as off', () => {
  const row = readVisible(read({ visible: { key: 'k', collapse: 'yes', scope: 'element' } }), P);
  expect(row?.collapse).toBe(false);
  expect(row?.documentScope).toBe(false);
});
