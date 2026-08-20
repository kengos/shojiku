// The format-catalog response guard. These are not shape-pedantry tests: the
// spellings in this response are derived from the author's own `formats:`
// registry, and picking one AUTHORS it into the document — so a malformed
// response has to stop here rather than become a wrong value in the file.

import { describe, expect, it } from 'vitest';
import { toFormatCatalog } from './formatCatalogResponse';
import { TransportError } from './transport';

const VARIANT = { spelling: 'wareki', origin: 'pack', samples: ['令和8年11月3日'] };
const TYPE = { fieldType: 'date', fixed: false, variants: [VARIANT] };
const PROBE = { sample: '2026.11.03', warning: null, refused: null };

function json(value: unknown): string {
  return JSON.stringify(value);
}

function ok() {
  return { types: [TYPE], probes: [PROBE] };
}

describe('toFormatCatalog', () => {
  it('reads a well-formed catalog', () => {
    const catalog = toFormatCatalog(json(ok()));
    expect(catalog.types[0].fieldType).toBe('date');
    expect(catalog.types[0].fixed).toBe(false);
    expect(catalog.types[0].variants[0]).toEqual(VARIANT);
    expect(catalog.probes[0]).toEqual(PROBE);
  });

  it('carries a warning and a refusal through', () => {
    const catalog = toFormatCatalog(
      json({
        types: [],
        probes: [
          { sample: '', warning: 'an inline pattern only applies…', refused: 'tooManyProbes' },
        ],
      }),
    );
    expect(catalog.probes[0].warning).toBe('an inline pattern only applies…');
    expect(catalog.probes[0].refused).toBe('tooManyProbes');
  });

  it('reads the two-sample quantity row', () => {
    const catalog = toFormatCatalog(
      json({
        types: [
          {
            fieldType: 'quantity',
            fixed: true,
            variants: [{ spelling: 'default', origin: 'builtin', samples: ['1点', '12,345点'] }],
          },
        ],
        probes: [],
      }),
    );
    expect(catalog.types[0].variants[0].samples).toHaveLength(2);
  });

  it('refuses malformed JSON', () => {
    expect(() => toFormatCatalog('{')).toThrow(TransportError);
  });

  it.each([
    ['a non-object root', json([])],
    ['types that are not an array', json({ types: {}, probes: [] })],
    ['probes that are not an array', json({ types: [], probes: {} })],
    ['a type entry that is not an object', json({ types: ['date'], probes: [] })],
    ['a non-string fieldType', json({ types: [{ ...TYPE, fieldType: 1 }], probes: [] })],
    ['a non-boolean fixed', json({ types: [{ ...TYPE, fixed: 'no' }], probes: [] })],
    ['variants that are not an array', json({ types: [{ ...TYPE, variants: 1 }], probes: [] })],
    [
      'a non-string spelling',
      json({ types: [{ ...TYPE, variants: [{ ...VARIANT, spelling: 1 }] }], probes: [] }),
    ],
    [
      'a non-string sample',
      json({ types: [{ ...TYPE, variants: [{ ...VARIANT, samples: [1] }] }], probes: [] }),
    ],
    [
      'samples that are not an array',
      json({ types: [{ ...TYPE, variants: [{ ...VARIANT, samples: 'x' }] }], probes: [] }),
    ],
    ['a non-string probe sample', json({ types: [], probes: [{ ...PROBE, sample: 1 }] })],
    ['a non-string warning', json({ types: [], probes: [{ ...PROBE, warning: 1 }] })],
  ])('refuses %s', (_what, source) => {
    expect(() => toFormatCatalog(source)).toThrow(TransportError);
  });

  it('refuses an origin outside the closed set', () => {
    const source = json({
      types: [{ ...TYPE, variants: [{ ...VARIANT, origin: 'elsewhere' }] }],
      probes: [],
    });
    expect(() => toFormatCatalog(source)).toThrow(TransportError);
  });

  it('refuses a refusal outside the closed set', () => {
    expect(() =>
      toFormatCatalog(json({ types: [], probes: [{ ...PROBE, refused: 'nope' }] })),
    ).toThrow(TransportError);
  });

  it('does not admit a prototype name as a closed-set member', () => {
    // The closed sets are matched against real arrays. An object table would
    // let `constructor` resolve to an inherited function and pass the guard.
    for (const hostile of ['constructor', '__proto__', 'toString', 'valueOf']) {
      const source = json({
        types: [{ ...TYPE, variants: [{ ...VARIANT, origin: hostile }] }],
        probes: [],
      });
      expect(() => toFormatCatalog(source), hostile).toThrow(TransportError);
    }
  });

  it('refuses an ABSENT optional field rather than reading it as unset', () => {
    // `null` is what serde writes for `None`; a MISSING key means a response
    // shape this reader does not understand, which is a different thing.
    expect(() =>
      toFormatCatalog(json({ types: [], probes: [{ sample: 'x', refused: null }] })),
    ).toThrow(TransportError);
  });

  it('names the field it refused, so a report says where the shape went wrong', () => {
    try {
      toFormatCatalog(json({ types: [{ ...TYPE, fieldType: 1 }], probes: [] }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('types[0].fieldType');
    }
  });
});
