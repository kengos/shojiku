import { describe, expect, it, vi } from 'vitest';
import type { LocaleIndex } from '../assets/manifest';
import { MAX_LOCALE_BYTES, makeLocaleSource } from './localeSource';

const index: LocaleIndex = { locales: ['fil-ph', 'hi-in', 'zh-cn', 'zh-tw'] };

const source = (fetchText: (url: string) => Promise<string>) =>
  makeLocaleSource({ fetchText, base: 'https://x/', index });

describe('makeLocaleSource', () => {
  it('fetches a shipped pack at the id-derived path', async () => {
    const fetchText = vi.fn(async () => 'id: zh-TW');
    expect(await source(fetchText).overlayFor('zh-TW')).toBe('id: zh-TW');
    expect(fetchText).toHaveBeenCalledWith('https://x/locale/zh-tw.yml');
  });

  it('lowercases the tag to reach the pack file', async () => {
    const fetchText = vi.fn(async () => 'id: zh-CN');
    await source(fetchText).overlayFor('ZH-cn');
    expect(fetchText).toHaveBeenCalledWith('https://x/locale/zh-cn.yml');
  });

  it('returns null without fetching for a builtin locale (no shipped pack)', async () => {
    const fetchText = vi.fn();
    expect(await source(fetchText).overlayFor('ja-JP')).toBeNull();
    expect(fetchText).not.toHaveBeenCalled();
  });

  it('returns null without fetching for a traversal-shaped tag', async () => {
    const fetchText = vi.fn();
    for (const tag of ['../secret', 'zh/tw', '..', '']) {
      expect(await source(fetchText).overlayFor(tag)).toBeNull();
    }
    expect(fetchText).not.toHaveBeenCalled();
  });

  it('rejects a pack over the size cap', async () => {
    const fetchText = vi.fn(async () => 'y'.repeat(MAX_LOCALE_BYTES + 1));
    await expect(source(fetchText).overlayFor('hi-IN')).rejects.toThrow(/size cap/);
  });

  it('accepts a pack exactly at the size cap', async () => {
    const fetchText = vi.fn(async () => 'y'.repeat(MAX_LOCALE_BYTES));
    await expect(source(fetchText).overlayFor('hi-IN')).resolves.toHaveLength(MAX_LOCALE_BYTES);
  });
});

describe('makeLocaleSource — the pack is fetched once per id', () => {
  it('serves a repeat ask from memory', async () => {
    // The locale panel re-asks whenever the document's `defaults:` slice
    // moves, which an unrelated font-size commit does. The pack cannot have
    // changed, so the second ask must cost no request.
    const fetchText = vi.fn(async () => 'id: zh-TW');
    const s = source(fetchText);
    expect(await s.overlayFor('zh-TW')).toBe('id: zh-TW');
    expect(await s.overlayFor('zh-TW')).toBe('id: zh-TW');
    expect(fetchText).toHaveBeenCalledTimes(1);
  });

  it('shares ONE request between two asks in flight at once', async () => {
    let release: (text: string) => void = () => undefined;
    const fetchText = vi.fn(() => new Promise<string>((resolve) => (release = resolve)));
    const s = source(fetchText);
    const first = s.overlayFor('hi-in');
    const second = s.overlayFor('hi-in');
    release('id: hi-IN');
    expect(await first).toBe('id: hi-IN');
    expect(await second).toBe('id: hi-IN');
    expect(fetchText).toHaveBeenCalledTimes(1);
  });

  it('does not remember a FAILURE, so a transient one is retried', async () => {
    // A cached rejection would make one offline moment permanent for the
    // session — the opposite of what the memo is for.
    const fetchText = vi
      .fn<(url: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('id: fil-PH');
    const s = source(fetchText);
    await expect(s.overlayFor('fil-ph')).rejects.toThrow('offline');
    expect(await s.overlayFor('fil-ph')).toBe('id: fil-PH');
    expect(fetchText).toHaveBeenCalledTimes(2);
  });

  it('does not remember an over-cap pack either', async () => {
    const fetchText = vi
      .fn<(url: string) => Promise<string>>()
      .mockResolvedValueOnce('x'.repeat(MAX_LOCALE_BYTES + 1))
      .mockResolvedValueOnce('id: zh-CN');
    const s = source(fetchText);
    await expect(s.overlayFor('zh-cn')).rejects.toThrow('size cap');
    expect(await s.overlayFor('zh-cn')).toBe('id: zh-CN');
  });
});
