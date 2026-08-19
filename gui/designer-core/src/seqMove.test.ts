// Tests for seqMove.ts — the cross-parent half of `moveItem`, exercised
// through `applyOp` (the ONE public entry). The same-sequence arm is pinned in
// `seqOps.test.ts` alongside the other three sequence ops; what lives here is
// everything a SECOND sequence brings: node identity across the move, the
// index rule, the self-nesting refusal, and the untouched-on-refusal posture.
import { describe, expect, it } from 'vitest';
import { parseTemplate } from './document';
import { applyOp, type Op } from './ops';

// A body with a container to move items into and out of. Written at the
// `eemeli/yaml` fixed point, and deliberately carrying furniture the JSON
// route would destroy: a comment on the moved item, an anchored style map and
// an alias referring to it.
const FIXTURE = [
  'version: 0.1.0',
  'anchors:',
  '  base: &base { fontSize: 12 }',
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        # the customer line, kept together with the address below',
  '        text: 領収書',
  '        style: *base',
  '      - type: container',
  '        items:',
  '          - type: text',
  '            text: 発行日',
  '      - type: rect',
  '        box: { x: 0, y: 100, w: 200, h: 40 }',
  '',
].join('\n');

const BODY = 'sections.body.items';
const NEST = 'sections.body.items[1].items';

function apply(source: string, op: Op): string {
  const doc = parseTemplate(source);
  const result = applyOp(doc, op);
  expect(result.ok).toBe(true);
  return String(doc);
}

function refuse(source: string, op: Op): string {
  const doc = parseTemplate(source);
  const result = applyOp(doc, op);
  expect(result.ok).toBe(false);
  expect(String(doc)).toBe(source);
  return result.ok === false ? result.error.code : '';
}

function types(source: string, path: 'body' | 'nest'): string[] {
  const body = parseTemplate(source).toJS().sections.body.items;
  const list =
    path === 'body' ? body : body.find((item: { type: string }) => item.type === 'container').items;
  return list.map((item: { type: string }) => item.type);
}

describe('moveItem across sequences', () => {
  it('moves an item into another sequence at the given index', () => {
    const out = apply(FIXTURE, { op: 'moveItem', path: BODY, from: 0, to: 0, toPath: NEST });
    expect(types(out, 'body')).toEqual(['container', 'rect']);
    expect(types(out, 'nest')).toEqual(['text', 'text']);
  });

  it('carries the moved node verbatim — its comment and its alias survive', () => {
    const out = apply(FIXTURE, { op: 'moveItem', path: BODY, from: 0, to: 1, toPath: NEST });
    expect(out).toContain('# the customer line, kept together with the address below');
    expect(out).toContain('style: *base');
    // The alias was never expanded into the map it points at.
    expect(out).not.toContain('style: { fontSize: 12 }');
  });

  it('appends when `to` equals the destination length', () => {
    const out = apply(FIXTURE, { op: 'moveItem', path: BODY, from: 2, to: 1, toPath: NEST });
    expect(types(out, 'nest')).toEqual(['text', 'rect']);
  });

  it('moves an item back OUT of a nested sequence', () => {
    // The first move leaves the body as [container, rect], so the container —
    // and its item list — has shifted to index 0.
    const nested = apply(FIXTURE, { op: 'moveItem', path: BODY, from: 0, to: 0, toPath: NEST });
    const out = apply(nested, {
      op: 'moveItem',
      path: 'sections.body.items[0].items',
      from: 0,
      to: 2,
      toPath: BODY,
    });
    expect(types(out, 'body')).toEqual(['container', 'rect', 'text']);
  });

  it('authors a BLOCK sequence when the destination was an empty flow list', () => {
    const source = FIXTURE.replace(
      '        items:\n          - type: text\n            text: 発行日\n',
      '        items: []\n',
    );
    const out = apply(source, { op: 'moveItem', path: BODY, from: 2, to: 0, toPath: NEST });
    expect(out).toContain('items:\n          - type: rect');
  });

  it('treats a destination that resolves to the SAME sequence as a reorder', () => {
    const out = apply(FIXTURE, { op: 'moveItem', path: BODY, from: 0, to: 2, toPath: BODY });
    expect(types(out, 'body')).toEqual(['container', 'rect', 'text']);
  });

  it('reads a differently SPELLED path to the same sequence as a reorder', () => {
    // `parsePath` takes `\[\d+\]` and converts with `Number`, so `[01]` and
    // `[1]` address one node — which is why the same-sequence check is node
    // IDENTITY rather than string equality.
    const out = apply(FIXTURE, {
      op: 'moveItem',
      path: 'sections.body.items[1].items',
      from: 0,
      to: 0,
      toPath: 'sections.body.items[01].items',
    });
    expect(types(out, 'nest')).toEqual(['text']);
    expect(types(out, 'body')).toEqual(['text', 'container', 'rect']);
  });

  it('refuses a destination index past the end', () => {
    expect(refuse(FIXTURE, { op: 'moveItem', path: BODY, from: 0, to: 2, toPath: NEST })).toBe(
      'index_out_of_range',
    );
  });

  it('refuses a negative or fractional destination index', () => {
    for (const to of [-1, 0.5]) {
      expect(refuse(FIXTURE, { op: 'moveItem', path: BODY, from: 0, to, toPath: NEST })).toBe(
        'index_out_of_range',
      );
    }
  });

  it('refuses a destination that is not a sequence', () => {
    expect(refuse(FIXTURE, { op: 'moveItem', path: BODY, from: 0, to: 0, toPath: 'anchors' })).toBe(
      'not_a_seq',
    );
  });

  it('refuses a destination that does not exist', () => {
    expect(refuse(FIXTURE, { op: 'moveItem', path: BODY, from: 0, to: 0, toPath: 'nope' })).toBe(
      'path_not_found',
    );
  });

  it('refuses moving an item into its OWN items list', () => {
    expect(refuse(FIXTURE, { op: 'moveItem', path: BODY, from: 1, to: 0, toPath: NEST })).toBe(
      'invalid_value',
    );
  });

  it('refuses moving an item into a DEEP descendant, not just a direct child', () => {
    const deep = [
      'sections:',
      '  body:',
      '    items:',
      '      - type: container',
      '        items:',
      '          - type: container',
      '            items:',
      '              - type: text',
      '                text: deep',
      '',
    ].join('\n');
    expect(
      refuse(deep, {
        op: 'moveItem',
        path: 'sections.body.items',
        from: 0,
        to: 0,
        toPath: 'sections.body.items[0].items[0].items',
      }),
    ).toBe('invalid_value');
  });

  it('clips a hostile destination path in the error message', () => {
    const doc = parseTemplate(FIXTURE);
    const toPath = `sections.body.${'x'.repeat(400)}`;
    const result = applyOp(doc, { op: 'moveItem', path: BODY, from: 0, to: 0, toPath });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error.message.length).toBeLessThan(toPath.length);
      expect(result.error.message).toContain('…');
    }
  });

  it('leaves a literal __proto__ key in the moved subtree inert data', () => {
    const source = [
      'sections:',
      '  body:',
      '    items:',
      '      - type: text',
      '        data: { __proto__: polluted }',
      '      - type: container',
      '        items: []',
      '',
    ].join('\n');
    const out = apply(source, {
      op: 'moveItem',
      path: 'sections.body.items',
      from: 0,
      to: 0,
      toPath: 'sections.body.items[1].items',
    });
    expect(out).toContain('__proto__: polluted');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('moveItem across sequences — anchor ordering', () => {
  // The change ADVERTISES anchor preservation, so the dangerous direction
  // needs pinning too: an anchor DEFINITION moved BELOW something that
  // aliases it. `eemeli/yaml` verifies alias order at stringify time.
  const ANCHORED = [
    'sections:',
    '  body:',
    '    items:',
    '      - type: text',
    '        style: &base { fontSize: 12 }',
    '      - type: container',
    '        items:',
    '          - type: text',
    '            style: *base',
    '',
  ].join('\n');

  it('refuses to move an item that DEFINES an anchor something else aliases', () => {
    const doc = parseTemplate(ANCHORED);
    const result = applyOp(doc, {
      op: 'moveItem',
      path: 'sections.body.items',
      from: 0,
      to: 1,
      toPath: 'sections.body.items[1].items',
    });
    // Allowing it produced a document that THROWS at stringify — "Unresolved
    // alias (the anchor must be set before the alias)" — which would surface
    // as a crashing save, not a diagnostic.
    expect(result.ok === false && result.error.code).toBe('invalid_value');
    expect(String(doc)).toBe(ANCHORED);
    expect(() => String(doc)).not.toThrow();
  });

  it('refuses the same-sequence reorder for the same reason', () => {
    const doc = parseTemplate(ANCHORED);
    const result = applyOp(doc, { op: 'moveItem', path: 'sections.body.items', from: 0, to: 1 });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
    expect(String(doc)).toBe(ANCHORED);
  });

  it('refuses the other direction too — lifting the alias USER above it', () => {
    // Symmetric hazard: lifting the user ABOVE the definition breaks the
    // document just as surely as sinking the definition below the user.
    const doc = parseTemplate(ANCHORED);
    const result = applyOp(doc, {
      op: 'moveItem',
      path: 'sections.body.items[1].items',
      from: 0,
      to: 0,
      toPath: 'sections.body.items',
    });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
    expect(String(doc)).toBe(ANCHORED);
  });

  it('allows the ordinary shape — a shared anchors block aliased from below', () => {
    // The refusal is exact, not a boundary heuristic: an alias whose anchor
    // sits in a top-level block ABOVE it stays resolvable wherever the item
    // moves within the sections, so the move must go through.
    const shared = [
      'anchors:',
      '  base: &base { fontSize: 12 }',
      'sections:',
      '  body:',
      '    items:',
      '      - type: text',
      '        style: *base',
      '      - type: container',
      '        items: []',
      '',
    ].join('\n');
    const doc = parseTemplate(shared);
    expect(
      applyOp(doc, {
        op: 'moveItem',
        path: 'sections.body.items',
        from: 0,
        to: 0,
        toPath: 'sections.body.items[1].items',
      }).ok,
    ).toBe(true);
    expect(String(doc)).toContain('style: *base');
  });

  it('still moves an item whose anchors are entirely SELF-CONTAINED', () => {
    const selfContained = [
      'sections:',
      '  body:',
      '    items:',
      '      - type: container',
      '        items:',
      '          - type: text',
      '            style: &own { fontSize: 12 }',
      '          - type: text',
      '            style: *own',
      '      - type: container',
      '        items: []',
      '',
    ].join('\n');
    const doc = parseTemplate(selfContained);
    expect(
      applyOp(doc, {
        op: 'moveItem',
        path: 'sections.body.items',
        from: 0,
        to: 0,
        toPath: 'sections.body.items[1].items',
      }).ok,
    ).toBe(true);
    const out = String(doc);
    expect(() => String(doc)).not.toThrow();
    expect(out).toContain('&own');
    expect(out).toContain('*own');
  });
});
