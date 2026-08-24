// Drift guards over the course DATA. The course is a hand-authored table of
// ids, and every id points at something that must exist: an anchor the chrome
// carries, a UI event the Designer emits, a sentence in both languages, and a
// seed the engine can parse. Each of these has already broken once in a
// hand-edited tutorial; a test is cheaper than a reader hitting it.

import { parseTemplate } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { bandCreateOp } from '../insert/bandCreate';
import { TOUR_ANCHOR_IDS, TOUR_ANCHORS } from './anchors';
import { CHAPTER_TITLES_EN, COPY_EN } from './copy.en';
import { CHAPTER_TITLES_JA, COPY_JA } from './copy.ja';
import { COURSE } from './course';
import { courseSteps, isUiEvent, stepDone } from './model';
import { PRACTICE_PARAMS } from './seeds';
import { TOPICS } from './topics';
import type { TutorialChapter, TutorialStep } from './types';

const STEPS = courseSteps(COURSE);

/** The section a step WAITS on, or `null` when it waits on something else. */
function selectionSection(step: TutorialStep): string | null {
  const done = step.done;
  if (!('selection' in done)) {
    return null;
  }
  return /^sections\.([a-z_]+)/.exec(done.selection.pathPrefix)?.[1] ?? null;
}

/** Every section a chapter can actually have: what its seed authors, plus what
 * its own steps create as they run. */
function reachableSections(chapter: TutorialChapter): ReadonlySet<string> {
  const seeded = [...chapter.seed.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
  const made = chapter.steps.flatMap((step) =>
    'ops' in step.done
      ? step.done.ops
          .filter((pred) => pred.op === 'putValue' && pred.keys?.[0] === 'sections')
          .map((pred) => pred.keys?.[1])
          .filter((name): name is string => name !== undefined)
      : [],
  );
  return new Set([...seeded, ...made]);
}

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
  it('never asks the reader to select a section the chapter cannot have', () => {
    // ch6 shipped exactly this bug: its copy said to select the footer in the
    // Structure tab, its seed authored none, and the tree omits an absent
    // section — so the step could never complete and the chapter dead-ended.
    // A selection-gated step must name a section the seed AUTHORS, or one an
    // EARLIER step in the same chapter creates.
    //
    // Every unit is swept, not just the course: repairing ch6 removed the last
    // selection-gated step from COURSE, so a course-only sweep would visit no
    // assertion at all and could not fail. `visited` is the sentinel that says
    // the rule reached something; `reachableSections` holds the logic, so the
    // known-bad case below exercises the SAME code the sweep runs.
    let visited = 0;
    for (const unit of [COURSE, ...TOPICS]) {
      for (const chapter of unit.chapters) {
        for (const step of chapter.steps) {
          const section = selectionSection(step);
          if (section !== null) {
            visited += 1;
            expect(
              reachableSections(chapter).has(section),
              `${step.id} waits on sections.${section}`,
            ).toBe(true);
          }
        }
      }
    }
    expect(visited).toBeGreaterThan(0);
  });

  it("ch6's first step is satisfied by the op the affordance actually dispatches", () => {
    // The chapter is only repaired if the REAL op completes the step — the
    // rule above proves the section is reachable, not that pressing the
    // control advances the reader. `bandCreateOp` is what both entry points
    // dispatch, so feed exactly that.
    const ch6 = COURSE.chapters.find((chapter) => chapter.id === 'ch6');
    const first = ch6?.steps[0];
    expect(first?.id).toBe('ch6.createFooter');
    expect(stepDone(first as TutorialStep, { kind: 'ops', ops: [bandCreateOp('footer')] })).toBe(
      true,
    );
    // ...and NOT by creating the other band.
    expect(stepDone(first as TutorialStep, { kind: 'ops', ops: [bandCreateOp('header')] })).toBe(
      false,
    );
  });

  it('the rule REJECTS a chapter that waits on a section it never has', () => {
    // The self-test: without it the sweep above passes by visiting nothing
    // interesting, and nothing would ever say the check works. This is ch6 as
    // it actually shipped — a footer-less seed plus a select-the-footer step.
    const broken = {
      id: 'ch-broken',
      seed: 'sections:\n  body:\n    type: flow\n    items: []\n',
      steps: [
        {
          id: 'ch-broken.select',
          anchor: { kind: 'sidebar', selector: TOUR_ANCHORS.sidebarTabs },
          done: { selection: { pathPrefix: 'sections.footer' } },
        },
      ],
    } as const;
    expect(selectionSection(broken.steps[0])).toBe('footer');
    expect(reachableSections(broken).has('footer')).toBe(false);

    // ...and ACCEPTS it once an earlier step creates the band.
    const repaired = {
      ...broken,
      steps: [
        {
          id: 'ch-broken.create',
          anchor: { kind: 'sidebar', selector: TOUR_ANCHORS.sidebarTabs },
          done: { ops: [{ op: 'putValue', keys: ['sections', 'footer'] }] },
        },
        ...broken.steps,
      ],
    } as const;
    expect(reachableSections(repaired).has('footer')).toBe(true);
  });

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
