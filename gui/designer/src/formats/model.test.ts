import { describe, expect, it } from 'vitest';
import {
  editableKind,
  FORMAT_DEFAULT_TYPES,
  FORMAT_KINDS,
  MAX_FORMATS,
  RESERVED_FORMAT_NAMES,
  readFormatsView,
} from './model';

describe('readFormatsView', () => {
  it('reads name, wire kind and pattern in document order', () => {
    expect(
      readFormatsView({
        closing: { type: 'date', pattern: 'yyyy.MM.dd' },
        received: { type: 'datetime', pattern: 'MM/dd HH:mm' },
      }),
    ).toEqual([
      { name: 'closing', kind: 'date', pattern: 'yyyy.MM.dd' },
      { name: 'received', kind: 'datetime', pattern: 'MM/dd HH:mm' },
    ]);
  });

  it('reads a non-map registry as no entries', () => {
    expect(readFormatsView(undefined)).toEqual([]);
    expect(readFormatsView('nope')).toEqual([]);
    expect(readFormatsView([1, 2])).toEqual([]);
  });

  it('skips an empty-string name — it is unaddressable by the keys grammar', () => {
    expect(readFormatsView({ '': { type: 'date', pattern: 'y' } })).toEqual([]);
  });

  it('still lists an entry the engine could not parse, showing what is written', () => {
    // The document is invalid for much of the time somebody is typing in it; a
    // row that vanishes mid-keystroke is worse than one showing the truth.
    expect(readFormatsView({ odd: { type: 'quarter', pattern: 5 } })).toEqual([
      { name: 'odd', kind: 'quarter', pattern: '' },
    ]);
    expect(readFormatsView({ bare: 'not a map' })).toEqual([
      { name: 'bare', kind: '', pattern: '' },
    ]);
  });

  it('reads a hostile name as an ordinary entry', () => {
    const view = readFormatsView({ __proto__: { type: 'date', pattern: 'y' } });
    // Object.entries never walks the prototype, so the name is either an own
    // key (and listed) or absent — never an inherited value.
    expect(view.every((entry) => typeof entry.name === 'string')).toBe(true);
  });
});

describe('the wire constants this model mirrors', () => {
  it('reserves exactly the nine FieldType names', () => {
    // Drift guard for `FieldType::from_name` — a registry entry named after a
    // field type could never be reached, and the engine errors
    // (`reserved_format_name`) rather than silently ignoring it.
    expect([...RESERVED_FORMAT_NAMES].sort()).toEqual([
      'boolean',
      'currency',
      'date',
      'datetime',
      'image',
      'number',
      'percentage',
      'quantity',
      'string',
    ]);
  });

  it('carries the two v1 entry kinds and the six default slots', () => {
    expect(FORMAT_KINDS).toEqual(['date', 'datetime']);
    expect(FORMAT_DEFAULT_TYPES).toEqual([
      'date',
      'datetime',
      'currency',
      'number',
      'percentage',
      'quantity',
    ]);
    expect(MAX_FORMATS).toBe(256);
  });

  it('every reserved name that is a default slot is spelled identically', () => {
    // The two lists come from different engine sources; a slot spelled
    // differently in one would make a picker offer a name the engine reserves.
    for (const type of FORMAT_DEFAULT_TYPES) {
      expect(RESERVED_FORMAT_NAMES).toContain(type);
    }
  });
});

describe('editableKind', () => {
  it('keeps a known kind', () => {
    expect(editableKind('date')).toBe('date');
    expect(editableKind('datetime')).toBe('datetime');
  });

  it('seeds an unknown or empty kind to date — the control has no third arm', () => {
    expect(editableKind('quarter')).toBe('date');
    expect(editableKind('')).toBe('date');
  });
});
