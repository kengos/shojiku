import { describe, expect, it } from 'vitest';
import { chapterTitle, courseCopy, stepCopy, topicSubtitle } from './copy';

describe('courseCopy', () => {
  it('speaks Japanese to a Japanese Designer', () => {
    expect(courseCopy('ja-JP').steps['ch0.margin']).toContain('余白');
    expect(courseCopy('ja').titles.ch0).toBe('白紙とページ設定');
  });

  it('falls back to English for every other language, hostile tags included', () => {
    for (const tag of ['en-US', 'zh-TW', 'de-DE', '', 'ja-nope-not-really'.slice(3)]) {
      expect(courseCopy(tag).titles.ch0).toBe('A blank page and its setup');
    }
  });

  it('matches a language tag case-insensitively', () => {
    expect(courseCopy('JA-JP').titles.ch0).toBe('白紙とページ設定');
  });
});

describe('lookups are own-property only', () => {
  it('returns a step’s sentence', () => {
    expect(stepCopy(courseCopy('en'), 'ch1.bold')).toBe('Make it bold from the format bar above.');
  });

  it('returns null for an unknown step instead of a raw key', () => {
    expect(stepCopy(courseCopy('en'), 'nope')).toBeNull();
  });

  it('never resolves an inherited property name', () => {
    const copy = courseCopy('en');
    expect(stepCopy(copy, 'constructor')).toBeNull();
    expect(stepCopy(copy, 'toString')).toBeNull();
    expect(stepCopy(copy, '__proto__')).toBeNull();
    expect(chapterTitle(copy, 'constructor')).toBe('constructor');
  });

  it('falls back to the chapter id when a title is missing', () => {
    expect(chapterTitle(courseCopy('en'), 'ch99')).toBe('ch99');
  });

  it('returns a topic subtitle, or null when there is none', () => {
    const copy = courseCopy('ja');
    expect(topicSubtitle(copy, 'topic-containers')).toBe('縦積み・表組み・ネスト・スロット追加');
    expect(topicSubtitle(copy, 'ch0')).toBeNull();
    expect(topicSubtitle(copy, 'constructor')).toBeNull();
  });

  it('merges chapter and topic titles into one lookup', () => {
    expect(chapterTitle(courseCopy('en'), 'topic-table')).toBe('Tables (list data)');
    expect(courseCopy('ja').launcher.sectionTopics).toContain('トピック');
  });
});
