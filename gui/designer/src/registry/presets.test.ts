import { describe, expect, it, vi } from 'vitest';
import { collectPresets, type PresetContribution, type PresetFiles } from './presets';

const FILES: PresetFiles = { source: 's', params: '{}', assets: [], variants: [] };

function contribution(overrides: Partial<PresetContribution> = {}): PresetContribution {
  return {
    id: 'receipt-ja',
    locales: ['ja'],
    engineLocale: 'ja-JP',
    name: { ja: '領収書' },
    load: async () => FILES,
    ...overrides,
  };
}

describe('collectPresets', () => {
  it('collects contributions in call order and returns copies', () => {
    const collector = collectPresets(() => {});
    collector.ctx.addPreset(contribution({ id: 'first' }));
    collector.ctx.addPreset(contribution({ id: 'second' }));
    collector.close();
    const entries = collector.entries();
    expect(entries.map((entry) => entry.id)).toEqual(['first', 'second']);
    expect(collector.entries()).not.toBe(entries);
  });

  it('throws on a contribution AFTER the event fired (a stashed ctx)', () => {
    const collector = collectPresets(() => {});
    collector.close();
    expect(() => collector.ctx.addPreset(contribution())).toThrowError(/already fired/);
  });

  it('drops and reports hostile ids — never a throw out of the collector', () => {
    const report = vi.fn();
    const collector = collectPresets(report);
    for (const id of ['../../evil', 'a/b', '', '.', '..', '__proto__x!', 'a'.repeat(65)]) {
      collector.ctx.addPreset(contribution({ id }));
    }
    // `__proto__` itself is charset-safe but must stay inert data in the Map.
    collector.ctx.addPreset(contribution({ id: '__proto__' }));
    collector.close();
    expect(collector.entries().map((entry) => entry.id)).toEqual(['__proto__']);
    expect(report).toHaveBeenCalledTimes(7);
    expect(String(report.mock.calls[0][0])).toContain('unsafe id');
  });

  it('drops a duplicate id first-wins — a package cannot shadow a bundled preset', () => {
    const report = vi.fn();
    const collector = collectPresets(report);
    const bundled = contribution({ id: 'receipt-ja' });
    collector.ctx.addPreset(bundled);
    collector.ctx.addPreset(contribution({ id: 'receipt-ja', name: { ja: '偽物' } }));
    collector.close();
    const entries = collector.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toBe(bundled);
    expect(String(report.mock.calls[0][0])).toContain('duplicate id');
  });

  it('strips a disallowed thumbnail URL but keeps the preset', () => {
    const report = vi.fn();
    const collector = collectPresets(report);
    collector.ctx.addPreset(contribution({ id: 'js', thumbnailUrl: 'javascript:alert(1)' }));
    collector.ctx.addPreset(
      contribution({ id: 'proto-rel', thumbnailUrl: '//evil.example/x.png' }),
    );
    collector.ctx.addPreset(contribution({ id: 'ftp', thumbnailUrl: 'ftp://evil.example/x.png' }));
    collector.ctx.addPreset(contribution({ id: 'data-text', thumbnailUrl: 'data:text/html,<x>' }));
    // Browsers strip tab/newline INSIDE a URL and trim leading whitespace, so
    // a control character anywhere is a scheme-smuggling vector — rejected
    // outright rather than re-implementing browser URL cleaning.
    collector.ctx.addPreset(contribution({ id: 'tab-smuggle', thumbnailUrl: 'java\tscript:x' }));
    collector.ctx.addPreset(contribution({ id: 'lead-space', thumbnailUrl: ' http://e/x.png' }));
    collector.close();
    for (const entry of collector.entries()) {
      expect(entry.thumbnailUrl).toBeUndefined();
    }
    expect(report).toHaveBeenCalledTimes(6);
    expect(String(report.mock.calls[0][0])).toContain('thumbnail');
  });

  it('keeps http, https, data:image, relative, and absent thumbnails', () => {
    const report = vi.fn();
    const collector = collectPresets(report);
    collector.ctx.addPreset(
      contribution({ id: 'https', thumbnailUrl: 'https://cdn.example/t.png' }),
    );
    // The app's own thumbnails are absolute over document.baseURI — on a
    // plain-http mount (localhost dev, an intranet host) that is `http:`.
    collector.ctx.addPreset(contribution({ id: 'http', thumbnailUrl: 'http://localhost/t.png' }));
    collector.ctx.addPreset(
      contribution({ id: 'data', thumbnailUrl: 'data:image/png;base64,AAAA' }),
    );
    collector.ctx.addPreset(contribution({ id: 'rel', thumbnailUrl: 'presets/rel/thumb.png' }));
    collector.ctx.addPreset(contribution({ id: 'none' }));
    collector.close();
    expect(collector.entries().map((entry) => entry.thumbnailUrl)).toEqual([
      'https://cdn.example/t.png',
      'http://localhost/t.png',
      'data:image/png;base64,AAAA',
      'presets/rel/thumb.png',
      undefined,
    ]);
    expect(report).not.toHaveBeenCalled();
  });
});
