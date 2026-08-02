import { describe, expect, it } from 'vitest';
import {
  composeDateTime,
  DEFAULT_OFFSET,
  needsSecondsStep,
  representativeOffset,
  splitDateTime,
} from './datetime';

describe('splitDateTime', () => {
  it('drops whole-minute :00 seconds so the input is minute-precision', () => {
    expect(splitDateTime('2026-07-05T15:30:00+09:00')).toEqual({
      wallClock: '2026-07-05T15:30',
      offset: '+09:00',
    });
  });

  it('keeps non-zero seconds and a Z offset verbatim', () => {
    expect(splitDateTime('2026-07-05T15:30:45Z')).toEqual({
      wallClock: '2026-07-05T15:30:45',
      offset: 'Z',
    });
  });

  it('parses an offset-less value (offset null) so the user can fix it', () => {
    expect(splitDateTime('2026-07-05T15:30')).toEqual({
      wallClock: '2026-07-05T15:30',
      offset: null,
    });
  });

  it('parses a seconds-less value carrying an offset', () => {
    expect(splitDateTime('2026-07-05T15:30+09:00')).toEqual({
      wallClock: '2026-07-05T15:30',
      offset: '+09:00',
    });
  });

  it('is null for a plain date, a number-shaped string, and garbage', () => {
    expect(splitDateTime('2026-07-05')).toBeNull();
    expect(splitDateTime('42')).toBeNull();
    expect(splitDateTime('not a datetime')).toBeNull();
    expect(splitDateTime(`2026-07-05T15:30:00+09:00${'x'.repeat(10000)}`)).toBeNull();
  });
});

describe('composeDateTime', () => {
  it('preserves the original offset and keeps existing seconds', () => {
    expect(composeDateTime('2026-07-05T15:30:45', '+09:00', DEFAULT_OFFSET)).toBe(
      '2026-07-05T15:30:45+09:00',
    );
  });

  it('appends :00 when the wall clock omits seconds', () => {
    expect(composeDateTime('2026-07-05T15:30', '+09:00', DEFAULT_OFFSET)).toBe(
      '2026-07-05T15:30:00+09:00',
    );
  });

  it('uses the fallback offset when the value had none', () => {
    expect(composeDateTime('2026-07-05T15:30', null, '+09:00')).toBe('2026-07-05T15:30:00+09:00');
  });

  it('drops fractional seconds a seconds-step input may emit', () => {
    expect(composeDateTime('2026-07-05T15:30:45.000', '+09:00', DEFAULT_OFFSET)).toBe(
      '2026-07-05T15:30:45+09:00',
    );
  });
});

describe('needsSecondsStep', () => {
  it('is true when the wall clock carries a seconds component', () => {
    expect(needsSecondsStep('2026-07-05T15:30:45')).toBe(true);
    expect(needsSecondsStep('2026-07-05T15:30')).toBe(false);
  });
});

describe('representativeOffset', () => {
  it('maps a known locale to its offset', () => {
    expect(representativeOffset('ja-JP')).toBe('+09:00');
    expect(representativeOffset('ja')).toBe('+09:00');
  });

  it('falls back to the neutral offset for unknown, undefined, and hostile tags', () => {
    expect(representativeOffset('en-US')).toBe(DEFAULT_OFFSET);
    expect(representativeOffset(undefined)).toBe(DEFAULT_OFFSET);
    // A prototype key must not resolve to an inherited value.
    expect(representativeOffset('constructor')).toBe(DEFAULT_OFFSET);
    expect(representativeOffset('__proto__')).toBe(DEFAULT_OFFSET);
  });
});
