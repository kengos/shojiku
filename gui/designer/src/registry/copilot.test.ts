import { Editor, type Op } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { COPILOT_INSTRUCTIONS, MAX_COPILOT_OPS, sanitizeCopilotOps } from './copilot';

/** One valid op of every kind the sanitizer admits. */
const ALL_KINDS = [
  { op: 'setScalar', keys: ['page', 'size'], value: 'A4' },
  { op: 'setStrings', path: 'sections.body.items[0]', keys: ['styleNames'], values: ['a'] },
  { op: 'removeKey', path: 'sections.body.items[0]', keys: ['style', 'color'] },
  { op: 'renameKey', keys: ['styles', 'old'], to: 'new' },
  { op: 'putValue', keys: ['styles', 'heading'], value: {} },
  { op: 'moveItem', path: 'sections.body.items', from: 0, to: 1 },
  { op: 'duplicateItem', path: 'sections.body.items', index: 0 },
  { op: 'insertItem', path: 'sections.body.items', index: 0, value: { type: 'rect' } },
  { op: 'removeItem', path: 'sections.body.items', index: 0 },
] as const;

describe('sanitizeCopilotOps', () => {
  it('admits a batch carrying every op kind', () => {
    const ops = sanitizeCopilotOps([...ALL_KINDS]);
    expect(ops).not.toBeNull();
    expect(ops?.length).toBe(ALL_KINDS.length);
  });

  it('refuses a non-array reply', () => {
    expect(sanitizeCopilotOps(undefined)).toBeNull();
    expect(sanitizeCopilotOps('setScalar')).toBeNull();
    expect(sanitizeCopilotOps({ op: 'setScalar' })).toBeNull();
  });

  it('refuses an empty op list', () => {
    expect(sanitizeCopilotOps([])).toBeNull();
  });

  it('refuses a list over the cap', () => {
    const over = Array.from({ length: MAX_COPILOT_OPS + 1 }, () => ({ ...ALL_KINDS[0] }));
    expect(sanitizeCopilotOps(over)).toBeNull();
    const at = Array.from({ length: MAX_COPILOT_OPS }, () => ({ ...ALL_KINDS[0] }));
    expect(sanitizeCopilotOps(at)).not.toBeNull();
  });

  it('refuses the WHOLE reply on one bad entry — never a partial filter', () => {
    expect(sanitizeCopilotOps([...ALL_KINDS, null])).toBeNull();
    expect(sanitizeCopilotOps([...ALL_KINDS, ['setScalar']])).toBeNull();
    expect(sanitizeCopilotOps([...ALL_KINDS, { keys: ['page'] }])).toBeNull();
    expect(sanitizeCopilotOps([...ALL_KINDS, { op: 7 }])).toBeNull();
  });

  it('refuses an unknown op name, including prototype names', () => {
    expect(sanitizeCopilotOps([{ op: 'setYaml', keys: ['a'], value: 1 }])).toBeNull();
    // The allowlist is a real Set: a prototype name must MISS, never resolve
    // to an inherited member.
    expect(sanitizeCopilotOps([{ op: 'constructor' }])).toBeNull();
    expect(sanitizeCopilotOps([{ op: '__proto__' }])).toBeNull();
    expect(sanitizeCopilotOps([{ op: 'toString' }])).toBeNull();
  });
});

describe('COPILOT_INSTRUCTIONS', () => {
  it('names every op kind the sanitizer admits — the contract text cannot drift', () => {
    for (const entry of ALL_KINDS) {
      expect(COPILOT_INSTRUCTIONS).toContain(`"${entry.op}"`);
    }
    expect(COPILOT_INSTRUCTIONS).toContain('256');
  });

  it('every admitted op kind actually dispatches in designer-core applyOp', () => {
    // The allowlist is load-bearing (applyOp has no runtime default case), and
    // this pins the other direction: each admitted name IS a designer-core op.
    // A tolerant fixture lets every kind either succeed or return a TYPED
    // OpError — an unknown name would return undefined and fail the shape check.
    const source = [
      'styles:',
      '  old: {}',
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: a',
      '      - type: text',
      '        text: b',
      '',
    ].join('\n');
    for (const entry of ALL_KINDS) {
      const editor = Editor.create(source);
      const result = editor.applyAll([entry] as readonly Op[]);
      expect(typeof result.ok).toBe('boolean');
    }
  });
});
