// @vitest-environment node
//
// A rule preset picks a FORMAT over a fixed owned key set: it authors what it
// declares, removes the owned keys it does not, and never touches the rest.
import { describe, expect, it } from 'vitest';
import { matchRulePreset, RULE_PRESETS, rulePresetOps } from './rulePresets';

const P = 'sections.body.items[0].row.conditionalStyles[0]';

describe('rulePresetOps', () => {
  it('authors the declared keys and removes only the owned keys the rule has', () => {
    const rule = { when: { key: 'k' }, style: { fontWeight: 'bold', textAlign: 'center' } };
    expect(rulePresetOps(P, rule, 'dim')).toEqual([
      { op: 'setScalar', path: P, keys: ['style', 'color'], value: '#9aa0a6' },
      { op: 'removeKey', path: P, keys: ['style', 'fontWeight'] },
    ]);
  });

  it('removes nothing from a rule with no style, or a hostile one', () => {
    for (const rule of [{}, { style: 'bold' }, null, 'rule']) {
      expect(rulePresetOps(P, rule, 'bold')).toEqual([
        { op: 'setScalar', path: P, keys: ['style', 'fontWeight'], value: 'bold' },
      ]);
    }
  });

  it('answers an unknown id — an inherited name included — with no ops', () => {
    expect(rulePresetOps(P, {}, 'purple')).toEqual([]);
    expect(rulePresetOps(P, {}, 'constructor')).toEqual([]);
  });
});

describe('matchRulePreset', () => {
  it('names the preset a rule carries EXACTLY, whatever else it has', () => {
    const style = { ...RULE_PRESETS.get('red'), textAlign: 'center' };
    expect(matchRulePreset({ style })).toBe('red');
  });

  it('reads an extra owned key or a different value as hand-tuned', () => {
    expect(matchRulePreset({ style: { fontWeight: 'bold', color: '#000000' } })).toBeNull();
    expect(matchRulePreset({ style: { backgroundColor: '#b7e1cd' } })).toBeNull();
  });

  it('matches nothing on an empty or hostile rule', () => {
    for (const rule of [{}, { style: [] }, undefined, 7]) {
      expect(matchRulePreset(rule)).toBeNull();
    }
  });
});
