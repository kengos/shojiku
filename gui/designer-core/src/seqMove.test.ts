// Tests for seqMove.ts — the cross-parent half of `moveItem`, exercised
// through `applyOp` (the ONE public entry). The same-sequence arm is pinned in
// `seqOps.test.ts` alongside the other three sequence ops; what lives here is
// everything a SECOND sequence brings: node identity across the move, the
// index rule, the self-nesting refusal, and the untouched-on-refusal posture —
// plus the comment above a sequence's FIRST entry, which the parser files on
// the sequence rather than the entry, in both arms.

import { describe, expect, it } from 'vitest';
import { isSeq } from 'yaml';
import { parseTemplate, serializeTemplate } from './document';
import { Editor } from './editor';
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

describe('moveItem — whose comment the one above the first entry is', () => {
  // `eemeli/yaml` parses the comment above a block sequence's FIRST entry onto
  // the sequence, and every later entry's onto the entry. The author's blank
  // line decides the first one: the lines directly above the entry are the
  // entry's and travel with it; lines separated from it by a blank line are a
  // note about the list and stay at the top. Both readings are pinned here.
  const RULE_PATH = 'sections.body.items[0].row.conditionalStyles';

  /** The reported shape: a table's rule list, one line per entry of `lines`. */
  function rules(...lines: string[]): string {
    return [
      'sections:',
      '  body:',
      '    items:',
      '      - type: table',
      '        row:',
      '          conditionalStyles:',
      ...lines.map((line) => (line === '' ? '' : `            ${line}`)),
      '',
    ].join('\n');
  }
  const A = ['# first', '- when: { key: a }'];
  const B = ['# second', '- when: { key: b }'];
  const C = ['# third', '- when: { key: c }'];
  const RULES = rules(...A, ...B, ...C);
  const NOTE = ['# evaluated top to bottom', ''];

  function move(source: string, from: number, to: number): string {
    const out = apply(source, { op: 'moveItem', path: RULE_PATH, from, to });
    // What the parser would give back — no drift on the next save.
    expect(serializeTemplate(parseTemplate(out))).toBe(out);
    return out;
  }

  it("carries the first entry's comment when that entry moves down", () => {
    expect(move(RULES, 0, 1)).toBe(rules(...B, ...A, ...C));
  });

  it("brings a later entry's comment with it INTO position 0", () => {
    expect(move(RULES, 2, 0)).toBe(rules(...C, ...A, ...B));
  });

  it('keeps a note separated by a blank line at the top when entry 0 moves', () => {
    expect(move(rules(...NOTE, ...A, ...B, ...C), 0, 2)).toBe(rules(...NOTE, ...B, ...C, ...A));
  });

  it('keeps that note above an entry moved INTO position 0, blank line and all', () => {
    expect(move(rules(...NOTE, ...A, ...B, ...C), 1, 0)).toBe(rules(...NOTE, ...B, ...A, ...C));
  });

  it('moves nothing when the only comment is the note and entry 0 carries none', () => {
    const source = rules(...NOTE, '- when: { key: a }', ...B);
    expect(move(source, 0, 1)).toBe(rules(...NOTE, ...B, '- when: { key: a }'));
  });

  it('splits on the LAST blank line — everything above it is the note', () => {
    const note = ['# one', '', '# two', ''];
    expect(move(rules(...note, ...A, ...B), 0, 1)).toBe(rules(...note, ...B, ...A));
  });

  it('does not read a bare `#` line as a blank line', () => {
    // The parser stores a bare `#` as a single space and a blank line as an
    // empty line, so the two never collide.
    const block = ['# first', '#', '# still first', '- when: { key: a }'];
    expect(move(rules(...block, ...B), 0, 1)).toBe(rules(...B, ...block));
  });

  it('leaves a note written above the KEY where it is', () => {
    const source = RULES.replace(
      '          conditionalStyles:\n',
      '          # evaluated top to bottom\n          conditionalStyles:\n',
    );
    const out = move(source, 0, 2);
    expect(out).toContain('          # evaluated top to bottom\n          conditionalStyles:\n');
    expect(out.endsWith('# first\n            - when: { key: a }\n')).toBe(true);
  });

  it("reads a comment on the KEY line as the first entry's — the parser files it the same way", () => {
    // `conditionalStyles: # c` lands where a comment directly above entry 0
    // does, and the first save writes it onto its own line there.
    const source = RULES.replace(
      'conditionalStyles:\n            # first\n',
      'conditionalStyles: # first\n',
    );
    expect(move(source, 0, 1)).toBe(rules(...B, ...A, ...C));
  });

  it("moves a comment on the entry's own line with the entry too", () => {
    const source = RULES.replace('- when: { key: a }', '- when: { key: a } # inline');
    expect(move(source, 0, 2).endsWith('# first\n            - when: { key: a } # inline\n')).toBe(
      true,
    );
  });

  it('joins the entry part ABOVE a comment the first entry carries in memory', () => {
    // The parser never produces both, but a document edited in memory can.
    const doc = parseTemplate(RULES);
    const seq = doc.getIn(['sections', 'body', 'items', 0, 'row', 'conditionalStyles'], true);
    if (!isSeq(seq)) {
      throw new Error('fixture');
    }
    (seq.items[0] as { commentBefore?: string }).commentBefore = ' own';
    expect(applyOp(doc, { op: 'moveItem', path: RULE_PATH, from: 0, to: 1 }).ok).toBe(true);
    expect(String(doc)).toContain(
      '            # first\n            # own\n            - when: { key: a }',
    );
  });

  it('leaves the comment above a FLOW sequence to the list', () => {
    const source = ['a:', '  # the list', '  [ x, y ]', ''].join('\n');
    const out = apply(source, { op: 'moveItem', path: 'a', from: 0, to: 1 });
    expect(out).toBe(['a:', '  # the list', '  [ y, x ]', ''].join('\n'));
  });

  it('carries the entry part, and keeps the note, when entry 0 moves to ANOTHER sequence', () => {
    const source = [
      'a:',
      '  # a note',
      '',
      '  # first',
      '  - x',
      '  # second',
      '  - y',
      'b:',
      '  - z',
      '',
    ];
    const out = apply(source.join('\n'), {
      op: 'moveItem',
      path: 'a',
      from: 0,
      to: 1,
      toPath: 'b',
    });
    expect(out).toBe(
      ['a:', '  # a note', '', '  # second', '  - y', 'b:', '  - z', '  # first', '  - x', ''].join(
        '\n',
      ),
    );
    expect(serializeTemplate(parseTemplate(out))).toBe(out);
  });

  it("keeps the destination's note and first comment in place when a move lands at 0", () => {
    const source = [
      'a:',
      '  - x',
      '  # second',
      '  - y',
      'b:',
      '  # b note',
      '',
      '  # b first',
      '  - z',
      '',
    ];
    const out = apply(source.join('\n'), {
      op: 'moveItem',
      path: 'a',
      from: 1,
      to: 0,
      toPath: 'b',
    });
    expect(out).toBe(
      [
        'a:',
        '  - x',
        'b:',
        '  # b note',
        '',
        '  # second',
        '  - y',
        '  # b first',
        '  - z',
        '',
      ].join('\n'),
    );
    expect(serializeTemplate(parseTemplate(out))).toBe(out);
  });

  it('takes the only entry out of a sequence with its comment', () => {
    const source = ['a:', '  # only', '  - x', 'b:', '  - z', ''].join('\n');
    const out = apply(source, { op: 'moveItem', path: 'a', from: 0, to: 0, toPath: 'b' });
    expect(out).toBe(['a: []', 'b:', '  # only', '  - x', '  - z', ''].join('\n'));
  });

  it("leaves the list's note behind when its only entry moves out", () => {
    const source = ['a:', '  # a note', '', '  # only', '  - x', 'b:', '  - z', ''].join('\n');
    const out = apply(source, { op: 'moveItem', path: 'a', from: 0, to: 0, toPath: 'b' });
    expect(out).toBe(
      ['a:', '  # a note', '', '  []', 'b:', '  # only', '  - x', '  - z', ''].join('\n'),
    );
    expect(serializeTemplate(parseTemplate(out))).toBe(out);
  });

  it("keeps an empty list's own comment as the list's note once an entry lands", () => {
    // It had no entry to describe, so it gains the blank line that keeps it
    // the list's instead of silently becoming the arriving entry's.
    const source = ['a:', '  # only', '  - x', 'b:', '  # b note', '  []', ''].join('\n');
    const out = apply(source, { op: 'moveItem', path: 'a', from: 0, to: 0, toPath: 'b' });
    expect(out).toBe(['a: []', 'b:', '  # b note', '', '  # only', '  - x', ''].join('\n'));
    expect(serializeTemplate(parseTemplate(out))).toBe(out);
  });

  it('adds no second blank line to an empty list note that already ends in one', () => {
    const source = ['a:', '  - x', 'b:', '  # b note', '', '  []', ''].join('\n');
    const out = apply(source, { op: 'moveItem', path: 'a', from: 0, to: 0, toPath: 'b' });
    expect(out).toBe(['a: []', 'b:', '  # b note', '', '  - x', ''].join('\n'));
  });

  it('rolls a refused move back byte-for-byte, head comments included', () => {
    const anchored = [
      'sections:',
      '  body:',
      '    items:',
      '      # the list',
      '',
      '      # defines the style',
      '      - type: text',
      '        style: &base { fontSize: 12 }',
      '      # uses it',
      '      - type: text',
      '        style: *base',
      '      - type: container',
      '        items:',
      '          # nested note',
      '',
      '          # nested head',
      '          - type: rect',
      '',
    ].join('\n');
    expect(refuse(anchored, { op: 'moveItem', path: BODY, from: 0, to: 1 })).toBe('invalid_value');
    expect(
      refuse(anchored, {
        op: 'moveItem',
        path: BODY,
        from: 0,
        to: 0,
        toPath: 'sections.body.items[2].items',
      }),
    ).toBe('invalid_value');
  });

  it('reorders the reported rule list through an Editor with each comment on its rule', () => {
    const ed = Editor.create(RULES);
    expect(ed.apply({ op: 'moveItem', path: RULE_PATH, from: 0, to: 1 }).ok).toBe(true);
    expect(ed.text()).toBe(rules(...B, ...A, ...C));
  });
});
