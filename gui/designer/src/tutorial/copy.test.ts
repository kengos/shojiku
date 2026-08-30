import { describe, expect, it } from 'vitest';
import { chapterTitle, courseCopy, stepCopy, topicSubtitle } from './copy';
import { CHAPTER_TITLES_EN, COPY_EN, TOPIC_SUBTITLES_EN, TOPIC_TITLES_EN } from './copy.en';
import { CHAPTER_TITLES_JA, COPY_JA, TOPIC_SUBTITLES_JA, TOPIC_TITLES_JA } from './copy.ja';

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
    expect(topicSubtitle(copy, 'topic-containers')).toBe('縦積み、表組み、入れ子、スロット追加');
    expect(topicSubtitle(copy, 'ch0')).toBeNull();
    expect(topicSubtitle(copy, 'constructor')).toBeNull();
  });

  it('merges chapter and topic titles into one lookup', () => {
    expect(chapterTitle(courseCopy('en'), 'topic-table')).toBe('Tables (list data)');
    expect(courseCopy('ja').launcher.sectionTopics).toContain('トピック');
  });
});

// The course QUOTES menu labels ("Insert → Container", 「挿入」→「コンテナ」),
// and several of those labels end in an ellipsis on screen. Documentation
// convention — the Microsoft Writing Style Guide and Google's developer
// documentation style guide agree — is to omit it when CITING a command in
// prose: the ellipsis is a property of the control as rendered, not of the name
// as quoted. English had always done this; Japanese had not, which is the only
// way the two files ever disagreed.
//
// Each language keeps its own delimiter (「」 is the sole device Japanese has
// for marking a label boundary in run-on kana/kanji; English gets it free from
// capitalisation and the arrow) — that part is convention, not divergence.
describe('the course cites a label without its ellipsis', () => {
  const values = [
    CHAPTER_TITLES_EN,
    CHAPTER_TITLES_JA,
    COPY_EN,
    COPY_JA,
    TOPIC_TITLES_EN,
    TOPIC_TITLES_JA,
    TOPIC_SUBTITLES_EN,
    TOPIC_SUBTITLES_JA,
  ].flatMap((table) => Object.entries(table));

  it('reads the whole course (the guard is never silently empty)', () => {
    expect(values.length).toBeGreaterThan(150);
  });

  it('would catch one (the positive control for an expected-empty sweep)', () => {
    expect('「コンテナ…」を開きます。'.includes('…')).toBe(true);
  });

  it('carries no ellipsis in either language', () => {
    // Blunt on purpose, like the sibling ellipsis gate: classifying a string as
    // a citation is guesswork, and the course has no genuine elision to protect.
    // If prose ever wants one, that is the moment to narrow this — not before.
    expect(values.filter(([, value]) => value.includes('…')).map(([key]) => key)).toEqual([]);
  });
});
