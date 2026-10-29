import { describe, expect, it } from 'vitest';
import { styleKeys } from './style';
import { surfaceFields, surfaceKeys } from './surface';

// Over the REAL committed catalog: the sizes are asserted so a key the engine
// adds or drops reds here before a panel lists it silently.
const COMPOSITES: ReadonlySet<string> = new Set(['TextDecoration', 'TextCombineUpright']);

describe('surfaceKeys', () => {
  it('lists every Style key for a named style', () => {
    expect(surfaceKeys({ kind: 'style' })).toEqual(styleKeys());
    expect(surfaceKeys({ kind: 'style' })).toHaveLength(24);
  });

  it('lists the Style keys defaults.style takes', () => {
    expect(surfaceKeys({ kind: 'defaultsStyle' })).toEqual([
      'fontSize',
      'fontFamily',
      'lineHeight',
      'color',
      'textAlign',
      'lineBreak',
      'textSpacingTrim',
      'hangingPunctuation',
      'fontWeight',
      'fontStyle',
      'letterSpacing',
      'writingMode',
      'textOrientation',
      'textCombineUpright',
    ]);
  });

  it('lists an item type own keys without the structural ones', () => {
    expect(surfaceKeys({ kind: 'item', type: 'list' })).toEqual([
      'bindings',
      'overflowText',
      'text',
    ]);
    expect(surfaceKeys({ kind: 'item', type: 'nope' })).toEqual([]);
  });
});

describe('surfaceFields', () => {
  it('reads every Style key to a kind a control edits', () => {
    const kinds = Object.fromEntries(
      surfaceFields({ kind: 'style' }, COMPOSITES).map((field) => [field.key, field.spec.kind]),
    );
    expect(kinds).toEqual({
      backgroundColor: 'color',
      borderColor: 'sides',
      borderRadius: 'length',
      borderStyle: 'sides',
      borderWidth: 'sides',
      color: 'color',
      fontFamily: 'text',
      fontSize: 'length',
      fontStyle: 'enum',
      fontWeight: 'enum',
      hangingPunctuation: 'enum',
      letterSpacing: 'length',
      lineBreak: 'enum',
      lineHeight: 'number',
      opacity: 'percent',
      overflow: 'enum',
      textAlign: 'enum',
      textCombineUpright: 'composite',
      textDecoration: 'composite',
      textOrientation: 'enum',
      textOverflow: 'enum',
      textSpacingTrim: 'enum',
      verticalAlign: 'enum',
      writingMode: 'enum',
    });
  });

  it('carries the capability, requiredness and initial value of each key', () => {
    const style = surfaceFields({ kind: 'defaultsStyle' }, COMPOSITES);
    expect(style).toHaveLength(14);
    expect(style.find((field) => field.key === 'lineBreak')).toEqual({
      key: 'lineBreak',
      spec: { kind: 'enum', values: ['normal', 'strict', 'loose', 'anywhere'] },
      capability: 'style.lineBreak',
      required: false,
      initial: 'normal',
    });
    expect(style.find((field) => field.key === 'fontSize')?.capability).toBeUndefined();

    const [bindings, overflowText] = surfaceFields({ kind: 'item', type: 'list' }, COMPOSITES);
    expect(bindings.key).toBe('bindings');
    expect(bindings.capability).toBe('binding.declarations');
    expect(bindings.spec.kind).toBe('map');
    expect(overflowText).toEqual({
      key: 'overflowText',
      spec: { kind: 'text' },
      capability: undefined,
      required: false,
      initial: '+{count}',
    });
    expect(surfaceFields({ kind: 'item', type: 'nope' }, COMPOSITES)).toEqual([]);
  });
});
