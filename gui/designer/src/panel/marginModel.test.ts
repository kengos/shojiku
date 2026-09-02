import { describe, expect, it } from 'vitest';
import {
  canStepUniformMargin,
  enterPerSideOps,
  enterUniformOps,
  MARGIN_SIDES,
  perSideOp,
  readMarginView,
  stepUniformMarginOp,
  uniformMarginOp,
} from './marginModel';

describe('MARGIN_SIDES', () => {
  it('is the wire/array order [top, right, bottom, left]', () => {
    expect(MARGIN_SIDES).toEqual(['top', 'right', 'bottom', 'left']);
  });
});

describe('readMarginView', () => {
  it('treats a missing page key as the uniform 25pt default', () => {
    const view = readMarginView(undefined);
    expect(view).toMatchObject({
      mode: 'uniform',
      uniform: '25',
      hasMarginKey: false,
      backing: 'none',
    });
    expect(view.sides).toEqual({ top: '25', right: '25', bottom: '25', left: '25' });
  });

  it('reads a bare number as a uniform scalar margin', () => {
    const view = readMarginView({ margin: 30 });
    expect(view).toMatchObject({
      mode: 'uniform',
      uniform: '30',
      hasMarginKey: true,
      backing: 'scalar',
    });
    expect(view.sides.left).toBe('30');
  });

  it('treats a non-finite number margin as the uniform default (scalar backing)', () => {
    const view = readMarginView({ margin: Number.POSITIVE_INFINITY });
    expect(view).toMatchObject({
      mode: 'uniform',
      uniform: '25',
      hasMarginKey: true,
      backing: 'scalar',
    });
  });

  it('reads a full per-side map, seeding the uniform value from a bare top side', () => {
    const view = readMarginView({ margin: { top: 20, right: 20, bottom: 20, left: 20 } });
    expect(view).toMatchObject({
      mode: 'perSide',
      hasMarginKey: true,
      backing: 'map',
      uniform: '20',
    });
    expect(view.sides).toEqual({ top: '20', right: '20', bottom: '20', left: '20' });
  });

  it('reads a partial map — unset sides are the wire default "0", verbatim units kept', () => {
    const view = readMarginView({ margin: { top: '15mm', right: null } });
    expect(view.mode).toBe('perSide');
    expect(view.sides).toEqual({ top: '15mm', right: '0', bottom: '0', left: '0' });
    // A non-bare top side has no single uniform numeral → the default seed.
    expect(view.uniform).toBe('25');
  });

  it('coerces a non-finite map side to the "0" default', () => {
    const view = readMarginView({ margin: { top: Number.NaN } });
    expect(view.sides.top).toBe('0');
  });

  it('reads a legacy [t, r, b, l] array per-side', () => {
    const view = readMarginView({ margin: [10, 20, 30, 40] });
    expect(view).toMatchObject({ mode: 'perSide', backing: 'array', hasMarginKey: true });
    expect(view.sides).toEqual({ top: '10', right: '20', bottom: '30', left: '40' });
  });

  it('treats an unrecognized scalar margin as the uniform default (replaceable scalar)', () => {
    const view = readMarginView({ margin: 'nonsense' });
    expect(view).toMatchObject({
      mode: 'uniform',
      uniform: '25',
      hasMarginKey: true,
      backing: 'scalar',
    });
  });

  it('treats a non-map page node as the default (no page key)', () => {
    expect(readMarginView('not a map').hasMarginKey).toBe(false);
  });
});

describe('uniformMarginOp', () => {
  it('writes a bare pt number, replacing the margin node', () => {
    expect(uniformMarginOp('40')).toEqual([
      { op: 'setScalar', keys: ['page', 'margin'], value: 40 },
    ]);
  });

  it('accepts zero', () => {
    expect(uniformMarginOp('0')).toEqual([{ op: 'setScalar', keys: ['page', 'margin'], value: 0 }]);
  });

  it('refuses a unit value (the all-sides form is a bare number only)', () => {
    expect(uniformMarginOp('15mm')).toBeNull();
  });

  it('refuses empty, negative, and garbage', () => {
    expect(uniformMarginOp('')).toBeNull();
    expect(uniformMarginOp('-5')).toBeNull();
    expect(uniformMarginOp('abc')).toBeNull();
  });
});

describe('enterPerSideOps', () => {
  it('drops an existing margin then seeds all four sides (one undo step)', () => {
    const view = readMarginView({ margin: 30 });
    expect(enterPerSideOps(view)).toEqual([
      { op: 'removeKey', keys: ['page', 'margin'] },
      { op: 'setScalar', keys: ['page', 'margin', 'top'], value: 30 },
      { op: 'setScalar', keys: ['page', 'margin', 'right'], value: 30 },
      { op: 'setScalar', keys: ['page', 'margin', 'bottom'], value: 30 },
      { op: 'setScalar', keys: ['page', 'margin', 'left'], value: 30 },
    ]);
  });

  it('omits the removeKey when there is no margin key yet', () => {
    const ops = enterPerSideOps(readMarginView(undefined));
    expect(ops).toHaveLength(4);
    expect(ops.every((op) => op.op === 'setScalar')).toBe(true);
  });

  it('falls a non-coercible seed side back to 0', () => {
    const view = readMarginView({ margin: { top: 'garbage' } });
    const top = enterPerSideOps(view).find((op) => op.op === 'setScalar' && op.keys[2] === 'top');
    expect(top).toEqual({ op: 'setScalar', keys: ['page', 'margin', 'top'], value: 0 });
  });
});

describe('enterUniformOps', () => {
  it('writes the uniform seed as a bare number, replacing the map', () => {
    const view = readMarginView({ margin: { top: 20, right: 20, bottom: 20, left: 20 } });
    expect(enterUniformOps(view)).toEqual([
      { op: 'setScalar', keys: ['page', 'margin'], value: 20 },
    ]);
  });
});

describe('perSideOp', () => {
  it('sets a single side when a map already backs the margin', () => {
    const view = readMarginView({ margin: { top: 10, right: 10, bottom: 10, left: 10 } });
    expect(perSideOp(view, 'right', '5%')).toEqual([
      { op: 'setScalar', keys: ['page', 'margin', 'right'], value: '5%' },
    ]);
  });

  it('writes a bare per-side numeral as a number', () => {
    const view = readMarginView({ margin: { top: 10, right: 10, bottom: 10, left: 10 } });
    expect(perSideOp(view, 'top', '12')).toEqual([
      { op: 'setScalar', keys: ['page', 'margin', 'top'], value: 12 },
    ]);
  });

  it('materializes the full map from a legacy array, applying the edit', () => {
    const view = readMarginView({ margin: ['garbage', 20, 30, 40] });
    expect(perSideOp(view, 'right', '50')).toEqual([
      { op: 'removeKey', keys: ['page', 'margin'] },
      { op: 'setScalar', keys: ['page', 'margin', 'top'], value: 0 },
      { op: 'setScalar', keys: ['page', 'margin', 'right'], value: 50 },
      { op: 'setScalar', keys: ['page', 'margin', 'bottom'], value: 30 },
      { op: 'setScalar', keys: ['page', 'margin', 'left'], value: 40 },
    ]);
  });

  it('materializes without a removeKey when there is no margin key', () => {
    const ops = perSideOp(readMarginView(undefined), 'top', '30');
    expect(ops).not.toBeNull();
    expect((ops as unknown[]).every((op) => (op as { op: string }).op === 'setScalar')).toBe(true);
  });

  it('refuses an over-long, empty, or garbage value', () => {
    const view = readMarginView({ margin: { top: 10 } });
    expect(perSideOp(view, 'top', '1234567890123')).toBeNull();
    expect(perSideOp(view, 'top', '  ')).toBeNull();
    expect(perSideOp(view, 'top', 'wat')).toBeNull();
  });
});

describe('canStepUniformMargin', () => {
  it('offers the buttons on a bare numeral, zero included', () => {
    expect(canStepUniformMargin('25')).toBe(true);
    expect(canStepUniformMargin('0')).toBe(true);
    expect(canStepUniformMargin('0.5')).toBe(true);
  });

  it('withholds them where the typed commit is also refused', () => {
    expect(canStepUniformMargin('')).toBe(false);
    expect(canStepUniformMargin('  ')).toBe(false);
    expect(canStepUniformMargin('25mm')).toBe(false);
    expect(canStepUniformMargin('-5')).toBe(false);
    expect(canStepUniformMargin('wide')).toBe(false);
  });
});

describe('stepUniformMarginOp', () => {
  it('steps the all-sides margin up by a point', () => {
    expect(stepUniformMarginOp('25', 1)).toEqual([
      { op: 'setScalar', keys: ['page', 'margin'], value: 26 },
    ]);
  });

  it('steps it down by a point', () => {
    expect(stepUniformMarginOp('25', -1)).toEqual([
      { op: 'setScalar', keys: ['page', 'margin'], value: 24 },
    ]);
  });

  it('steps a fractional margin without leaving binary-float noise behind', () => {
    expect(stepUniformMarginOp('0.5', 1)).toEqual([
      { op: 'setScalar', keys: ['page', 'margin'], value: 1.5 },
    ]);
  });

  it('authors NOTHING stepping down from a zero margin', () => {
    // The floor is the whole reason this builder exists rather than the generic
    // `stepValueOp` the item fields use: that one would author -1 here, a value
    // `uniformMarginOp` refuses from the keyboard. The button stays enabled and
    // the document does not move, as a native number input's does at its
    // minimum.
    expect(stepUniformMarginOp('0', -1)).toBeNull();
  });

  it('CLAMPS to the legal zero from below one point, rather than going inert', () => {
    // 0 is a legal all-sides margin, so ▼ from a fractional value must reach
    // it. Declining here would leave an enabled button that can never author a
    // value the keyboard authors fine.
    expect(stepUniformMarginOp('0.5', -1)).toEqual([
      { op: 'setScalar', keys: ['page', 'margin'], value: 0 },
    ]);
  });

  it('keeps the precision the author typed, rather than rounding to 2 places', () => {
    // `uniformMarginOp` accepts any plain decimal, so a third decimal is an
    // ordinary authored value. A fixed two-place rounding would author 26.38
    // here and discard a digit the author entered.
    expect(stepUniformMarginOp('25.375', 1)).toEqual([
      { op: 'setScalar', keys: ['page', 'margin'], value: 26.375 },
    ]);
  });

  it('authors nothing when the numeral is too large for the step to move it', () => {
    // Past 2^53 the `+ 1` is absorbed; authoring the result would mint an undo
    // entry for a change that did not happen.
    expect(stepUniformMarginOp(`1${'0'.repeat(20)}`, 1)).toBeNull();
  });

  it('authors nothing from an EMPTY field', () => {
    // `Number('')` is 0, so a numeric guard alone would step a cleared field to 1.
    expect(stepUniformMarginOp('', 1)).toBeNull();
  });

  it('authors nothing from a unit-bearing value, which this field cannot hold', () => {
    expect(stepUniformMarginOp('25mm', 1)).toBeNull();
  });
});
