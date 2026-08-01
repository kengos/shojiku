import { describe, expect, it } from 'vitest';
import { hostConfigOf } from './hostConfig';
import type { DesignerProps } from './props';

/** The minimal props a Designer mount needs; each case overrides what it tests. */
function propsOf(over: Partial<DesignerProps> = {}): DesignerProps {
  return { source: 'version: 1\n', ...over } as DesignerProps;
}

describe('hostConfigOf ownership flags', () => {
  it('defaults both ownership flags to false when the host omits them', () => {
    const host = hostConfigOf(propsOf(), 'ja');
    expect(host.sampleDataReadOnly).toBe(false);
    expect(host.definitionsProjectScoped).toBe(false);
  });

  it('honours a mounted host that marks the sample side read-only', () => {
    expect(hostConfigOf(propsOf({ sampleDataReadOnly: true }), 'ja').sampleDataReadOnly).toBe(true);
  });

  it('honours a project-scoped definitions wire', () => {
    const host = hostConfigOf(propsOf({ definitionsProjectScoped: true }), 'ja');
    expect(host.definitionsProjectScoped).toBe(true);
  });

  it('resolves the flags INDEPENDENTLY (one set does not carry the other)', () => {
    const host = hostConfigOf(propsOf({ sampleDataReadOnly: true }), 'ja');
    expect(host.definitionsProjectScoped).toBe(false);
  });
});

describe('hostConfigOf passthrough', () => {
  it('carries the RESOLVED chrome locale, not a props field', () => {
    // `locale` is the composer's resolved value; `DesignerProps` has no such
    // key, so a regression that reads props instead would surface here.
    expect(hostConfigOf(propsOf(), 'zh-TW').locale).toBe('zh-TW');
  });

  it('passes the host font/engine configuration through untouched', () => {
    const host = hostConfigOf(
      propsOf({
        fontFamilies: ['noto-sans'],
        capabilities: ['style.border'],
        defaultFontFamily: 'noto-sans',
        engineLocale: 'ja-JP',
      }),
      'ja',
    );
    expect(host.fontFamilies).toEqual(['noto-sans']);
    expect(host.capabilities).toEqual(['style.border']);
    expect(host.defaultFontFamily).toBe('noto-sans');
    expect(host.engineLocale).toBe('ja-JP');
  });

  it('leaves the optional injectables undefined when the host injects none', () => {
    const host = hostConfigOf(propsOf(), 'ja');
    expect(host.imageCodec).toBeUndefined();
    expect(host.synth).toBeUndefined();
    expect(host.capabilities).toBeUndefined();
  });

  it('never carries the raw untrusted host menu entries', () => {
    // The bundle reaches every shell child, so unvalidated host input must not
    // travel in it — `hostMenuEntries` stays a narrow TopChrome input that
    // `topMenubar` validates. A regression that folds it in fails here.
    const host = hostConfigOf(
      propsOf({ hostMenuEntries: [{ id: 'x', label: 'x', onSelect: () => {} }] }),
      'ja',
    );
    expect(Object.keys(host)).not.toContain('hostMenuEntries');
  });
});
