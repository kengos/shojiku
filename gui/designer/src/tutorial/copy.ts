// Which language the course speaks. The course (and the topic shorts) ship in
// Japanese — the language they were written and reader-tested in — with English
// as the fallback for every other Designer language, deliberately narrower than
// the chrome catalog, whose short labels do translate well.

import {
  CHAPTER_TITLES_EN,
  COPY_EN,
  LAUNCHER_EN,
  TOPIC_SUBTITLES_EN,
  TOPIC_TITLES_EN,
} from './copy.en';
import {
  CHAPTER_TITLES_JA,
  COPY_JA,
  LAUNCHER_JA,
  TOPIC_SUBTITLES_JA,
  TOPIC_TITLES_JA,
} from './copy.ja';
export interface CourseCopy {
  /** Step id → the sentence shown in the coach mark. */
  readonly steps: Record<string, string>;
  /** Chapter id AND topic id → its heading (shown in the launcher). */
  readonly titles: Record<string, string>;
  /** Topic id → its one-line launcher subtitle. */
  readonly subtitles: Record<string, string>;
  /** The launcher's own labels: section headers and the trust-note intro. */
  readonly launcher: {
    readonly sectionCourse: string;
    readonly sectionTopics: string;
    readonly intro: string;
  };
}

/** Resolve the course copy for a BCP 47 tag. Japanese for `ja*`, else English. */
export function courseCopy(locale: string): CourseCopy {
  if (locale.toLowerCase().startsWith('ja')) {
    return {
      steps: COPY_JA,
      titles: { ...CHAPTER_TITLES_JA, ...TOPIC_TITLES_JA },
      subtitles: TOPIC_SUBTITLES_JA,
      launcher: LAUNCHER_JA,
    };
  }
  return {
    steps: COPY_EN,
    titles: { ...CHAPTER_TITLES_EN, ...TOPIC_TITLES_EN },
    subtitles: TOPIC_SUBTITLES_EN,
    launcher: LAUNCHER_EN,
  };
}

/** The sentence for a copy key (a step's `copyId ?? id`), or null when it has
 * no copy — the overlay then shows nothing rather than a raw key. */
export function stepCopy(copy: CourseCopy, copyKey: string): string | null {
  return Object.hasOwn(copy.steps, copyKey) ? copy.steps[copyKey] : null;
}

/** The heading for a chapter or topic, or its id when untranslated. */
export function chapterTitle(copy: CourseCopy, id: string): string {
  return Object.hasOwn(copy.titles, id) ? copy.titles[id] : id;
}

/** The subtitle for a topic, or null when it has none (a chapter has none). */
export function topicSubtitle(copy: CourseCopy, topicId: string): string | null {
  return Object.hasOwn(copy.subtitles, topicId) ? copy.subtitles[topicId] : null;
}
