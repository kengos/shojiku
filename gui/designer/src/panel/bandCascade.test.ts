import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { cascadeContext } from '../toolbar/cascade';
import { effectiveValueIn } from '../toolbar/effective';
import {
  bandContext,
  bandInk,
  documentOrigin,
  headerFillOf,
  readBandCascades,
  ruleContext,
} from './bandCascade';

const TABLE = 'sections.body.items[0]';
const FLOOR = { textAlign: 'left', color: '#000000', fontWeight: 'normal' };

/** A `read` over one document literal, resolving ANY structural path the way the
 * real `Editor.read` does — a stub answering only the table path would make
 * every column's cascade read as empty, which is a fixture limitation rather
 * than behaviour. */
function reader(doc: Record<string, unknown>): ReadFn {
  return (path: string) => {
    let cursor: unknown = doc;
    for (const step of path.split(/[.[\]]/).filter((s) => s !== '')) {
      if (typeof cursor !== 'object' || cursor === null) {
        return undefined;
      }
      cursor = (cursor as Record<string, unknown>)[step];
    }
    return cursor;
  };
}

function docWith(table: unknown, rest: Record<string, unknown> = {}): Record<string, unknown> {
  return { sections: { body: { items: [table] } }, ...rest };
}

/** One band's effective value for `key`, the way the editor resolves it. */
function bandValue(doc: Record<string, unknown>, owner: 'header' | 'row', key: string) {
  return effectiveValueIn(readBandCascades(reader(doc), TABLE, FLOOR)[owner], key);
}

describe('bandContext — the layers a band sits on', () => {
  it('takes the band as the item and pushes the TABLE in as the innermost ancestor', () => {
    const doc = docWith({
      type: 'table',
      style: { color: '#123456' },
      row: { style: {} },
    });
    const ctx = readBandCascades(reader(doc), TABLE, FLOOR).row;
    expect(ctx.ancestors[0]).toMatchObject({ type: 'table', style: { color: '#123456' } });
    expect(effectiveValueIn(ctx, 'color')).toMatchObject({
      value: '#123456',
      own: '',
      origin: 'inherited',
    });
  });

  it('gives the header and body bands the SAME ancestor stack', () => {
    const doc = docWith({ type: 'table', style: { textAlign: 'center' } });
    const bands = readBandCascades(reader(doc), TABLE, FLOOR);
    expect(bands.header.ancestors).toEqual(bands.row.ancestors);
    expect(effectiveValueIn(bands.header, 'textAlign').value).toBe('center');
    expect(effectiveValueIn(bands.row, 'textAlign').value).toBe('center');
  });

  it("lets the band's own value beat the table's", () => {
    const doc = docWith({
      type: 'table',
      style: { textAlign: 'center' },
      header: { style: { textAlign: 'right' } },
    });
    expect(bandValue(doc, 'header', 'textAlign')).toMatchObject({
      value: 'right',
      own: 'right',
      origin: 'own',
    });
  });

  it("resolves a band's `styleNames` through the registry, beating the table", () => {
    const doc = docWith(
      {
        type: 'table',
        style: { color: '#111111' },
        row: { styleNames: ['emphasis'] },
      },
      { styles: { emphasis: { color: '#c00000' } } },
    );
    expect(bandValue(doc, 'row', 'color')).toMatchObject({
      value: '#c00000',
      origin: 'style',
      styleName: 'emphasis',
    });
  });

  it('falls to `defaults.style`, then to the engine floor', () => {
    const withDefaults = docWith({ type: 'table' }, { defaults: { style: { color: '#00aa00' } } });
    expect(bandValue(withDefaults, 'row', 'color')).toMatchObject({
      value: '#00aa00',
      origin: 'default',
    });
    expect(bandValue(docWith({ type: 'table' }), 'row', 'color')).toMatchObject({
      value: '#000000',
      origin: 'engine',
    });
  });

  // The layer a column sits on is `toolbar/cascade`'s, not this module's — but
  // it is the third of the three stacks the band editors render, so the panel
  // owes an assertion that it really is row-band-over-table.
  it('resolves a COLUMN over its row band, then the table', () => {
    const doc = docWith({
      type: 'table',
      style: { textAlign: 'center' },
      row: { style: { textAlign: 'right' } },
      columns: [{ label: 'a' }],
    });
    const ctx = cascadeContext(reader(doc), `${TABLE}.columns[0]`, FLOOR);
    expect(effectiveValueIn(ctx, 'textAlign')).toMatchObject({
      value: 'right',
      own: '',
      origin: 'inherited',
    });
  });

  // `ComputedStyle::base` resets the non-inherited properties, so a cell only
  // LOOKS like it carries the row band's fill: the row band paints beneath it.
  // The panel must not report paint order as a cascade.
  it('never resolves `backgroundColor` from an ancestor layer', () => {
    const doc = docWith({
      type: 'table',
      style: { backgroundColor: '#eeeeee' },
      row: { style: { backgroundColor: '#dddddd' } },
      columns: [{ label: 'a' }],
    });
    expect(bandValue(doc, 'header', 'backgroundColor')).toMatchObject({
      value: '',
      origin: 'unset',
    });
    const column = cascadeContext(reader(doc), `${TABLE}.columns[0]`, FLOOR);
    expect(effectiveValueIn(column, 'backgroundColor')).toMatchObject({
      value: '',
      origin: 'unset',
    });
  });
});

describe('bandContext — a hostile document degrades, never throws', () => {
  it.each([
    ['a string band', 'nope'],
    ['a sequence band', [1, 2]],
    ['a numeric band', 7],
    ['an absent band', undefined],
  ])('reads %s as an empty item', (_label, band) => {
    const ctx = bandContext(cascadeContext(reader(docWith({ type: 'table' })), TABLE, FLOOR), band);
    expect(effectiveValueIn(ctx, 'color')).toMatchObject({ own: '', origin: 'engine' });
  });

  it('reads a band whose `style` is a sequence as unset', () => {
    const doc = docWith({ type: 'table', row: { style: [1, 2] } });
    expect(bandValue(doc, 'row', 'textAlign')).toMatchObject({ own: '', origin: 'engine' });
  });

  // The shipped `display` policy: strings verbatim, NUMBERS stringified (a
  // `fontSize: 12` is legitimate wire), everything else unset. So a hostile
  // `fontWeight: 42` stays visible as `42` — visible and therefore clearable —
  // while a map reads as nothing at all.
  it('stringifies a numeric band property and reads a map one as unset', () => {
    const doc = docWith({ type: 'table', row: { style: { fontWeight: 42, color: {} } } });
    expect(bandValue(doc, 'row', 'fontWeight')).toMatchObject({ own: '42', origin: 'own' });
    expect(bandValue(doc, 'row', 'color')).toMatchObject({ own: '', origin: 'engine' });
  });

  // Registry names are attacker strings: the lookup is own-property-guarded, so
  // a band naming `__proto__` resolves to no style rather than to an inherited
  // object off `Object.prototype`.
  it.each(['__proto__', 'constructor', 'toString'])(
    'refuses the prototype-chain style name %s',
    (name) => {
      const doc = docWith({ type: 'table', row: { styleNames: [name] } }, { styles: {} });
      expect(bandValue(doc, 'row', 'color')).toMatchObject({
        value: '#000000',
        origin: 'engine',
        styleName: '',
      });
    },
  );

  it('contributes no layers for a column path that does not parse', () => {
    const doc = docWith({ type: 'table', style: { textAlign: 'right' } });
    const ctx = cascadeContext(reader(doc), '', FLOOR);
    expect(ctx.ancestors).toEqual([]);
    expect(effectiveValueIn(ctx, 'textAlign')).toMatchObject({ value: 'left', origin: 'engine' });
  });
});

describe('ruleContext — a rule is one more layer over the body band', () => {
  const DOC = docWith({
    type: 'table',
    style: { textAlign: 'center', color: '#111111' },
    row: { style: { fontWeight: 'bold', color: '#222222' } },
  });

  function ruleValue(rule: unknown, key: string) {
    return effectiveValueIn(ruleContext(cascadeContext(reader(DOC), TABLE, FLOOR), rule), key);
  }

  it('stacks the rule over the body band over the table', () => {
    // The band wins where it speaks…
    expect(ruleValue({}, 'color')).toMatchObject({ value: '#222222', origin: 'inherited' });
    // …and the table shows through where it does not.
    expect(ruleValue({}, 'textAlign')).toMatchObject({ value: 'center', origin: 'inherited' });
  });

  it("lets the rule's own value beat the band's", () => {
    expect(ruleValue({ style: { color: '#c00000' } }, 'color')).toMatchObject({
      value: '#c00000',
      origin: 'own',
    });
  });

  // Same call `toolbar/cascade` makes for a column: the zebra applies to every
  // other row, and one control shows one value.
  it('leaves `alternateStyle` out of the stack', () => {
    const zebra = docWith({
      type: 'table',
      row: { style: {}, alternateStyle: { fontWeight: 'bold' } },
    });
    const ctx = ruleContext(cascadeContext(reader(zebra), TABLE, FLOOR), {});
    expect(effectiveValueIn(ctx, 'fontWeight')).toMatchObject({
      value: 'normal',
      origin: 'engine',
    });
  });

  it('degrades a hostile rule entry to an empty item', () => {
    expect(ruleValue('nope', 'color')).toMatchObject({ value: '#222222', origin: 'inherited' });
    expect(ruleValue(7, 'color').own).toBe('');
  });
});

describe('bandInk — what the miniature draws', () => {
  it('reports the EFFECTIVE ink, not the authored one', () => {
    const doc = docWith({ type: 'table' }, { defaults: { style: { color: '#00aa00' } } });
    const bands = readBandCascades(reader(doc), TABLE, FLOOR);
    expect(bandInk(bands.header)).toEqual({ color: '#00aa00', bold: false, fill: '' });
  });

  it('reads a bold band, however the boldness arrives', () => {
    const doc = docWith(
      {
        type: 'table',
        header: { style: { fontWeight: 'bold' } },
        row: { styleNames: ['strong'] },
      },
      { styles: { strong: { fontWeight: 'bold' } } },
    );
    const bands = readBandCascades(reader(doc), TABLE, FLOOR);
    expect(bandInk(bands.header).bold).toBe(true);
    expect(bandInk(bands.row).bold).toBe(true);
  });
});

describe('documentOrigin — which origins earn a LINE', () => {
  it.each(['style', 'inherited', 'default'] as const)('narrates %s', (origin) => {
    expect(documentOrigin({ value: 'x', cascade: 'x', own: '', origin, styleName: '' })).toBe(true);
  });

  it.each(['own', 'unset', 'engine'] as const)('stays silent about %s', (origin) => {
    expect(documentOrigin({ value: 'x', cascade: 'x', own: '', origin, styleName: '' })).toBe(
      false,
    );
  });
});

// `table_header_atom` resolves the header's own style AND its `styleNames`, and
// falls back to `#ededed` only when THAT produced nothing. Reading the wire alone
// would report the floor for a header tinted through a named style — and then the
// origin line, the one floor value this panel defends showing, would be false.
describe('headerFillOf — resolved, then floored', () => {
  const FLOOR = '#ededed';

  function headerFill(doc: Record<string, unknown>) {
    return headerFillOf(readBandCascades(reader(doc), TABLE, {}).header, FLOOR);
  }

  it('falls to the engine floor when nothing supplies a fill', () => {
    expect(headerFill(docWith({ type: 'table' }))).toEqual({
      value: FLOOR,
      cascade: FLOOR,
      own: '',
      origin: 'engine',
      styleName: '',
    });
  });

  it("reports an authored fill as the band's OWN value", () => {
    expect(
      headerFill(docWith({ type: 'table', header: { style: { backgroundColor: '#dbe7ff' } } })),
    ).toMatchObject({ value: '#dbe7ff', own: '#dbe7ff', origin: 'own' });
  });

  it('reports a fill arriving through `styleNames`, rather than the floor', () => {
    const doc = docWith(
      { type: 'table', header: { styleNames: ['dark'] } },
      { styles: { dark: { backgroundColor: '#1f2937' } } },
    );
    expect(headerFill(doc)).toMatchObject({
      value: '#1f2937',
      origin: 'style',
      styleName: 'dark',
    });
  });

  it('carries a named-style fill into the miniature too', () => {
    const doc = docWith(
      { type: 'table', row: { styleNames: ['tint'] } },
      { styles: { tint: { backgroundColor: '#eef2ff' } } },
    );
    expect(bandInk(readBandCascades(reader(doc), TABLE, {}).row).fill).toBe('#eef2ff');
  });
});
