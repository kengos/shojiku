// Drift guards over the course DATA. The course is a hand-authored table of
// ids, and every id points at something that must exist: an anchor the chrome
// carries, a UI event the Designer emits, a sentence in both languages, and a
// seed the engine can parse. Each of these has already broken once in a
// hand-edited tutorial; a test is cheaper than a reader hitting it.

import { parseTemplate } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { TOUR_ANCHOR_IDS } from './anchors';
import { CHAPTER_TITLES_EN, COPY_EN } from './copy.en';
import { CHAPTER_TITLES_JA, COPY_JA } from './copy.ja';
import { COURSE } from './course';
import { courseSteps, isUiEvent } from './model';
import { PRACTICE_PARAMS } from './seeds';
import { TOPICS } from './topics';

const STEPS = courseSteps(COURSE);

describe('the course structure', () => {
  it('runs the nine chapters of the script, blank page through export', () => {
    expect(COURSE.chapters.map((c) => c.id)).toEqual([
      'ch0',
      'ch1',
      'ch2',
      'ch3',
      'ch4',
      'ch5',
      'ch6',
      'ch7',
      'ch8',
    ]);
  });

  it('gives every step a unique id', () => {
    const ids = STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names its steps after the chapter they belong to', () => {
    for (const chapter of COURSE.chapters) {
      for (const step of chapter.steps) {
        expect(step.id.startsWith(`${chapter.id}.`)).toBe(true);
      }
    }
  });
});

describe('every step points at something real', () => {
  it('anchors chrome steps at a registered id', () => {
    for (const step of STEPS) {
      if (step.anchor.kind !== 'canvas') {
        expect(TOUR_ANCHOR_IDS).toContain(step.anchor.selector);
      }
    }
  });

  it('anchors canvas steps at a document path', () => {
    for (const step of STEPS) {
      if (step.anchor.kind === 'canvas') {
        expect(step.anchor.selector.startsWith('sections.')).toBe(true);
      }
    }
  });

  it('waits only on UI events the schema admits', () => {
    for (const step of STEPS) {
      if ('ui' in step.done) {
        expect(isUiEvent(step.done.ui)).toBe(true);
      }
    }
  });

  it('has a sentence in both languages for every step', () => {
    for (const step of STEPS) {
      expect(Object.hasOwn(COPY_JA, step.id)).toBe(true);
      expect(Object.hasOwn(COPY_EN, step.id)).toBe(true);
    }
  });

  it('carries no copy for a step that no longer exists', () => {
    // The copy maps are shared with the topic shorts: a valid key is a course
    // step id or a topic step that owns its copy (no copyId). Reused topic steps
    // point at a course key via copyId and carry none of their own.
    const valid = new Set<string>(STEPS.map((s) => s.id));
    for (const topic of TOPICS) {
      for (const step of courseSteps(topic)) {
        if (step.copyId === undefined) {
          valid.add(step.id);
        }
      }
    }
    expect(Object.keys(COPY_JA).filter((id) => !valid.has(id))).toEqual([]);
    expect(Object.keys(COPY_EN).filter((id) => !valid.has(id))).toEqual([]);
  });

  it('titles every chapter in both languages, and no others', () => {
    const ids = COURSE.chapters.map((c) => c.id);
    expect(Object.keys(CHAPTER_TITLES_JA).sort()).toEqual([...ids].sort());
    expect(Object.keys(CHAPTER_TITLES_EN).sort()).toEqual([...ids].sort());
  });
});

describe('the practice documents', () => {
  it('parses every chapter seed as a template', () => {
    for (const chapter of COURSE.chapters) {
      expect(() => parseTemplate(chapter.seed)).not.toThrow();
    }
  });

  it('starts blank and builds up to the finished invoice', () => {
    expect(COURSE.chapters[0].seed).toContain('items: []');
    const last = COURSE.chapters[8].seed;
    expect(last).toContain('type: table');
    expect(last).toContain('footer:');
    expect(last).toContain('type: page_number');
  });

  it('binds only ASCII data keys, which are the ones the engine interpolates', () => {
    for (const chapter of COURSE.chapters) {
      // Interpolation expressions carry no spaces, which also skips the YAML
      // flow maps (`{ direction: row, gap: 8 }`) the seeds are full of.
      for (const match of chapter.seed.matchAll(/\{([^}\s]+)\}/g)) {
        // `{key}` and `{key:format}` — the engine's key charset is [A-Za-z0-9_.]
        expect(match[1].split(':')[0]).toMatch(/^[A-Za-z0-9_.]+$/);
      }
    }
  });

  it('ships sample data covering every key the seeds bind', () => {
    const params = JSON.parse(PRACTICE_PARAMS) as Record<string, unknown>;
    expect(Object.keys(params).sort()).toEqual(['customer', 'date', 'items', 'total']);
    const last = COURSE.chapters[8].seed;
    for (const key of Object.keys(params)) {
      expect(last).toContain(key);
    }
  });
});
