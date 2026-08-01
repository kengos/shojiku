import { describe, expect, it } from 'vitest';
import * as core from './index';

// Smoke test that the public surface is wired up (the barrel re-export file).
describe('public surface', () => {
  it('exports the editor, ops, document, and path entry points', () => {
    expect(typeof core.Editor.create).toBe('function');
    expect(typeof core.applyOp).toBe('function');
    expect(typeof core.parseTemplate).toBe('function');
    expect(typeof core.readTemplate).toBe('function');
    expect(typeof core.readNode).toBe('function');
    expect(typeof core.parsePath).toBe('function');
    expect(typeof core.formatPath).toBe('function');
    expect(typeof core.toYamlPath).toBe('function');
    expect(core.MAX_HISTORY).toBeGreaterThan(0);
    expect(core.MAX_BATCH_OPS).toBeGreaterThan(0);
    expect(core.MAX_KEY_DEPTH).toBeGreaterThan(0);
    expect(core.MAX_STRING_VALUES).toBeGreaterThan(0);
    expect(core.MAX_TEMPLATE_BYTES).toBeGreaterThan(0);
    expect(core.MAX_ALIAS_COUNT).toBeGreaterThan(0);
  });
});
