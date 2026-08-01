// Drift guards over the topic-short DATA — the same discipline as the course:
// every id points at something real (an anchor, a UI event, a sentence in both
// languages, a parseable seed), reused steps point at a real course sentence,
// and no progress id collides across units.

import { parseTemplate } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { TOUR_ANCHOR_IDS } from './anchors';
import { COPY_EN, TOPIC_SUBTITLES_EN, TOPIC_TITLES_EN } from './copy.en';
import { COPY_JA, TOPIC_SUBTITLES_JA, TOPIC_TITLES_JA } from './copy.ja';
import { COURSE } from './course';
import { courseSteps, isUiEvent } from './model';
import { TOPICS } from './topics';

const COURSE_IDS = new Set(courseSteps(COURSE).map((s) => s.id));
const TOPIC_STEPS = TOPICS.flatMap((t) => courseSteps(t));

describe('the topic set', () => {
  it('offers the six shorts the script asks for, in order', () => {
    expect(TOPICS.map((t) => t.id)).toEqual([
      'topic-containers',
      'topic-binding',
      'topic-table',
      'topic-footer',
      'topic-placement',
      'topic-style',
    ]);
  });

  it('is one chapter each (a topic is a single-chapter unit)', () => {
    for (const topic of TOPICS) {
      expect(topic.chapters).toHaveLength(1);
      expect(topic.chapters[0].id).toBe(topic.id);
    }
  });

  it('keeps every progress id globally unique across the course and all topics', () => {
    const ids = [...COURSE_IDS, ...TOPIC_STEPS.map((s) => s.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is 5±2 steps per topic (the length discipline)', () => {
    for (const topic of TOPICS) {
      const n = topic.chapters[0].steps.length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });
});

describe('every topic step points at something real', () => {
  it('anchors chrome steps at a registered id, canvas steps at a document path', () => {
    for (const step of TOPIC_STEPS) {
      if (step.anchor.kind === 'canvas') {
        expect(step.anchor.selector.startsWith('sections.')).toBe(true);
      } else {
        expect(TOUR_ANCHOR_IDS).toContain(step.anchor.selector);
      }
    }
  });

  it('waits only on UI events the schema admits', () => {
    for (const step of TOPIC_STEPS) {
      if ('ui' in step.done) {
        expect(isUiEvent(step.done.ui)).toBe(true);
      }
    }
  });

  it('reuses a course sentence via a copyId that names a real course step', () => {
    for (const step of TOPIC_STEPS) {
      if (step.copyId !== undefined) {
        expect(COURSE_IDS.has(step.copyId)).toBe(true);
      }
    }
  });

  it('gives every topic-specific step its own sentence in both languages', () => {
    for (const step of TOPIC_STEPS) {
      if (step.copyId === undefined) {
        expect(Object.hasOwn(COPY_JA, step.id)).toBe(true);
        expect(Object.hasOwn(COPY_EN, step.id)).toBe(true);
      }
    }
  });

  it('resolves a coach sentence for EVERY step (reused or own)', () => {
    for (const step of TOPIC_STEPS) {
      const key = step.copyId ?? step.id;
      expect(Object.hasOwn(COPY_JA, key)).toBe(true);
      expect(Object.hasOwn(COPY_EN, key)).toBe(true);
    }
  });
});

describe('topic launcher copy', () => {
  it('titles and subtitles every topic in both languages, and no others', () => {
    const ids = TOPICS.map((t) => t.id).sort();
    for (const map of [TOPIC_TITLES_JA, TOPIC_TITLES_EN, TOPIC_SUBTITLES_JA, TOPIC_SUBTITLES_EN]) {
      expect(Object.keys(map).sort()).toEqual([...ids]);
    }
  });
});

describe('the topic practice documents', () => {
  it('parses every topic seed as a template', () => {
    for (const topic of TOPICS) {
      expect(() => parseTemplate(topic.chapters[0].seed)).not.toThrow();
    }
  });

  it('binds only ASCII data keys, the ones the engine interpolates', () => {
    for (const topic of TOPICS) {
      for (const match of topic.chapters[0].seed.matchAll(/\{([^}\s]+)\}/g)) {
        expect(match[1].split(':')[0]).toMatch(/^[A-Za-z0-9_.]+$/);
      }
    }
  });
});
