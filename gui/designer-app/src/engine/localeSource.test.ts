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
