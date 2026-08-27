import { MAX_BATCH_OPS } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { deleteFormatOps, renameFormatOps } from './refOps';
import type { FormatRef, FormatUsage } from './usage';

const usage = (refs: Record<string, FormatRef[]>, truncated = false): FormatUsage => ({
  refs: new Map(Object.entries(refs)),
  truncated,
});

const BINDING: FormatRef = {
  path: 'sections.body.items[0].data',
  keys: ['format'],
  addressable: true,
};
const DEFAULTS: FormatRef = { keys: ['defaults', 'formats', 'date'], addressable: true };

/** A chip reference: the name sits inside a longer interpolated string, so the
 * rewrite restates the whole string rather than the name alone. */
const CHIP: FormatRef = {
  path: 'sections.body.items[1]',
  keys: ['text'],
  addressable: true,
  text: 'Due {order.when:closing} / {order.when:closing}',
};

/** A budget with room to spare — the size guard is exercised on its own. */
const ROOMY = { textBytes: 1_000, maxBytes: 2_000_000 };

describe('renameFormatOps', () => {
  it('rewrites the registry key AND both kinds of reference in ONE batch', () => {
    const plan = renameFormatOps(
      'closing',
      'cutoff',
      ['closing'],
      usage({ closing: [BINDING, DEFAULTS] }),
      ROOMY,
    );
    expect(plan).toEqual({
      ok: true,
      ops: [
        { op: 'renameKey', keys: ['formats', 'closing'], to: 'cutoff' },
        {
          op: 'setScalar',
          path: 'sections.body.items[0].data',
          keys: ['format'],
          value: 'cutoff',
        },
        { op: 'setScalar', keys: ['defaults', 'formats', 'date'], value: 'cutoff' },
      ],
    });
  });

  it('renames an unreferenced entry with the registry op alone', () => {
    const plan = renameFormatOps('closing', 'cutoff', ['closing'], usage({}), ROOMY);
    expect(plan.ok && plan.ops).toHaveLength(1);
  });

  it('refuses an empty, duplicate, RESERVED or AMBIGUOUS target', () => {
    const u = usage({});
    expect(renameFormatOps('a', '', ['a'], u, ROOMY)).toEqual({ ok: false, reason: 'empty_name' });
    expect(renameFormatOps('a', 'b', ['a', 'b'], u, ROOMY)).toEqual({
      ok: false,
      reason: 'duplicate_name',
    });
    // Renaming to itself is a duplicate (existingNames includes the source).
    expect(renameFormatOps('a', 'a', ['a'], u, ROOMY)).toEqual({
      ok: false,
      reason: 'duplicate_name',
    });
    // A field-type name is refused as a registry entry — conservatively:
    // reachable on a dated field, unreachable on the other seven types.
    expect(renameFormatOps('a', 'currency', ['a'], u, ROOMY)).toEqual({
      ok: false,
      reason: 'reserved_name',
    });
    // A builtin variant spelling on another type CAN be reached, but the
    // document would then carry one word meaning two things.
    for (const name of ['default', 'symbol', 'name', 'value']) {
      expect(renameFormatOps('a', name, ['a'], u, ROOMY)).toEqual({
        ok: false,
        reason: 'ambiguous_name',
      });
    }
  });

  it('refuses WHOLE on a truncated walk, a non-addressable ref, or an over-cap batch', () => {
    expect(renameFormatOps('a', 'b', ['a'], usage({ a: [BINDING] }, true), ROOMY)).toEqual({
      ok: false,
      reason: 'truncated_usage',
    });
    expect(
      renameFormatOps('a', 'b', ['a'], usage({ a: [{ ...BINDING, addressable: false }] }), ROOMY),
    ).toEqual({ ok: false, reason: 'unaddressable_ref' });
    const many = Array.from({ length: MAX_BATCH_OPS }, () => BINDING);
    expect(renameFormatOps('a', 'b', ['a'], usage({ a: many }), ROOMY)).toEqual({
      ok: false,
      reason: 'batch_too_large',
    });
  });

  it('REFUSES a rename that would push the document past its size cap', () => {
    // A rename is the one registry operation that GROWS the document — by the
    // name delta at the registry key AND at every reference — and nothing
    // downstream re-checks the bytes: `applyAll` bounds the op COUNT only.
    const tight = { textBytes: 1_000, maxBytes: 1_010 };
    expect(
      renameFormatOps('a', 'a-much-longer-name', ['a'], usage({ a: [BINDING, DEFAULTS] }), tight),
    ).toEqual({ ok: false, reason: 'document_too_large' });
    // The same rename fits when there is room for it.
    expect(
      renameFormatOps('a', 'a-much-longer-name', ['a'], usage({ a: [BINDING, DEFAULTS] }), ROOMY)
        .ok,
    ).toBe(true);
  });

  it('measures a name in UTF-8 BYTES, not UTF-16 units', () => {
    // 「締め日」 is 9 bytes and 3 `.length` units; measuring by `.length`
    // would under-count every non-ASCII name by a factor of three.
    const tight = { textBytes: 1_000, maxBytes: 1_006 };
    expect(renameFormatOps('a', '締め日', ['a'], usage({}), tight)).toEqual({
      ok: false,
      reason: 'document_too_large',
    });
  });

  it('allows a SHRINKING rename however tight the budget', () => {
    const full = { textBytes: 2_000_000, maxBytes: 2_000_000 };
    expect(
      renameFormatOps(
        'a-long-name',
        'a',
        ['a-long-name'],
        usage({ 'a-long-name': [BINDING] }),
        full,
      ).ok,
    ).toBe(true);
  });

  it('checks the NAME guards before the reference guards', () => {
    // A duplicate name on a truncated document still reports the duplicate:
    // that is the one the author can act on.
    expect(renameFormatOps('a', 'b', ['a', 'b'], usage({ a: [BINDING] }, true), ROOMY)).toEqual({
      ok: false,
      reason: 'duplicate_name',
    });
  });
});

describe('deleteFormatOps', () => {
  it('removes the entry AND clears every reference, in one batch', () => {
    expect(deleteFormatOps('closing', usage({ closing: [BINDING, DEFAULTS] }))).toEqual({
      ok: true,
      ops: [
        { op: 'removeKey', keys: ['formats', 'closing'] },
        { op: 'removeKey', path: 'sections.body.items[0].data', keys: ['format'] },
        { op: 'removeKey', keys: ['defaults', 'formats', 'date'] },
      ],
    });
  });

  it('takes the same whole-or-nothing refusals as rename', () => {
    expect(deleteFormatOps('a', usage({ a: [BINDING] }, true))).toEqual({
      ok: false,
      reason: 'truncated_usage',
    });
    expect(deleteFormatOps('a', usage({ a: [{ ...BINDING, addressable: false }] }))).toEqual({
      ok: false,
      reason: 'unaddressable_ref',
    });
    const many = Array.from({ length: MAX_BATCH_OPS }, () => BINDING);
    expect(deleteFormatOps('a', usage({ a: many }))).toEqual({
      ok: false,
      reason: 'batch_too_large',
    });
  });
});

describe('chip references', () => {
  it('renames EVERY occurrence inside the string, in one setScalar', () => {
    const plan = renameFormatOps(
      'closing',
      'cutoff',
      ['closing'],
      usage({ closing: [CHIP] }),
      ROOMY,
    );
    expect(plan).toEqual({
      ok: true,
      ops: [
        { op: 'renameKey', keys: ['formats', 'closing'], to: 'cutoff' },
        {
          op: 'setScalar',
          path: 'sections.body.items[1]',
          keys: ['text'],
          value: 'Due {order.when:cutoff} / {order.when:cutoff}',
        },
      ],
    });
  });

  it('STRIPS the pick on a delete rather than removing the text key', () => {
    // `removeKey` here would delete the whole `text:` — the reference is a
    // fragment of a longer string, not a key of its own.
    const plan = deleteFormatOps('closing', usage({ closing: [CHIP] }));
    expect(plan).toEqual({
      ok: true,
      ops: [
        { op: 'removeKey', keys: ['formats', 'closing'] },
        {
          op: 'setScalar',
          path: 'sections.body.items[1]',
          keys: ['text'],
          value: 'Due {order.when} / {order.when}',
        },
      ],
    });
  });

  it('measures the size delta per OCCURRENCE, not per reference', () => {
    // The chip fixture names `closing` twice, so a +7-byte rename grows the
    // document by 7 (the registry key) + 14 (the two occurrences) = 21 — a
    // per-reference formula would have budgeted 14 and overflowed the cap.
    const base = 1_000;
    const tight = { textBytes: base, maxBytes: base + 20 };
    expect(
      renameFormatOps('closing', 'closingXXXXXXX', ['closing'], usage({ closing: [CHIP] }), tight),
    ).toEqual({ ok: false, reason: 'document_too_large' });
    const roomy = { textBytes: base, maxBytes: base + 21 };
    expect(
      renameFormatOps('closing', 'closingXXXXXXX', ['closing'], usage({ closing: [CHIP] }), roomy)
        .ok,
    ).toBe(true);
  });

  it('refuses whole when a chip reference is non-addressable', () => {
    const stuck = { ...CHIP, addressable: false };
    expect(
      renameFormatOps('closing', 'cutoff', ['closing'], usage({ closing: [stuck] }), ROOMY),
    ).toEqual({ ok: false, reason: 'unaddressable_ref' });
    expect(deleteFormatOps('closing', usage({ closing: [stuck] }))).toEqual({
      ok: false,
      reason: 'unaddressable_ref',
    });
  });

  it('rewrites a chip reference in the `document:` block', () => {
    // The shape the walk really emits for the metadata block: `document:` is
    // the map, the field is the drill. (A chip ref is never ROOT-addressed —
    // only `defaults.formats.<type>` is, and that one carries no text.)
    const meta: FormatRef = {
      path: 'document',
      keys: ['title'],
      addressable: true,
      text: 'Invoice {order.when:closing}',
    };
    const plan = renameFormatOps(
      'closing',
      'cutoff',
      ['closing'],
      usage({ closing: [meta] }),
      ROOMY,
    );
    expect(plan.ok && plan.ops[1]).toEqual({
      op: 'setScalar',
      path: 'document',
      keys: ['title'],
      value: 'Invoice {order.when:cutoff}',
    });
    const removal = deleteFormatOps('closing', usage({ closing: [meta] }));
    expect(removal.ok && removal.ops[1]).toEqual({
      op: 'setScalar',
      path: 'document',
      keys: ['title'],
      value: 'Invoice {order.when}',
    });
  });
});
