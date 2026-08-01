import { describe, expect, it } from 'vitest';
import { INHERITED_STYLE_FIELDS } from './defaultsModel';
import { buildStyleFloor, ENGINE_STYLE_DEFAULTS } from './engineDefaults';

describe('ENGINE_STYLE_DEFAULTS', () => {
  it('carries the six static engine defaults (docs/engine/style.md)', () => {
    expect(ENGINE_STYLE_DEFAULTS).toEqual({
      fontSize: '10',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: '1.4',
      color: '#000000',
    });
  });

  it('deliberately omits fontFamily (host-derived) and backgroundColor (non-inherited)', () => {
    expect('fontFamily' in ENGINE_STYLE_DEFAULTS).toBe(false);
    expect('backgroundColor' in ENGINE_STYLE_DEFAULTS).toBe(false);
  });

  it('covers every inherited style field except the host-derived fontFamily', () => {
    // The seedable set = the inherited fields minus fontFamily (seeded from the
    // host's default face, not a static constant).
    const seedable = INHERITED_STYLE_FIELDS.map((f) => f.key).filter((k) => k !== 'fontFamily');
    expect(seedable.sort()).toEqual(Object.keys(ENGINE_STYLE_DEFAULTS).sort());
  });
});

describe('buildStyleFloor', () => {
  it('returns the static defaults when no default family is given', () => {
    expect(buildStyleFloor()).toEqual(ENGINE_STYLE_DEFAULTS);
    expect(buildStyleFloor(undefined)).toEqual(ENGINE_STYLE_DEFAULTS);
  });

  it('treats an empty family as absent (a floor entry is always a real value)', () => {
    expect(buildStyleFloor('')).toEqual(ENGINE_STYLE_DEFAULTS);
    expect('fontFamily' in buildStyleFloor('')).toBe(false);
  });

  it('adds the host default face as the fontFamily floor', () => {
    const floor = buildStyleFloor('biz-udp-gothic');
    expect(floor.fontFamily).toBe('biz-udp-gothic');
    // The static defaults are still present.
    expect(floor.fontSize).toBe('10');
  });
});
