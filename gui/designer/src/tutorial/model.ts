// The tutorial's pure model: does this event complete the step, where does a
// resumed course pick up, and what does the persisted progress mean. No React,
// no DOM — the completion rules are testable as data in / boolean out.

import type { Op } from '@shojiku/designer-core';
import {
  type OpPredicate,
  type TutorialCourse,
  type TutorialEvent,
  type TutorialProgress,
  type TutorialStep,
  UI_EVENTS,
} from './types';

/** Cap on a persisted progress payload. Storage is user-writable, so an
 * oversized blob is rejected outright rather than parsed. */
export const MAX_PROGRESS_BYTES = 32 * 1024;

/** The empty progress a fresh user (or an unreadable store) starts from. */
export const EMPTY_PROGRESS: TutorialProgress = { completed: [], dismissed: false };

/** A path matches a prefix when it IS the prefix or continues it at a segment
 * boundary — so `items[1]` never matches a predicate written for `items[10]`. */
function pathHasPrefix(path: string, prefix: string): boolean {
  if (!path.startsWith(prefix)) {
    return false;
  }
  const rest = path.slice(prefix.length);
  return rest === '' || rest.startsWith('.') || rest.startsWith('[');
}

/** Every op carries `keys` (map-addressing ops) or not (sequence ops); a
 * predicate naming keys only ever matches the former. */
function opKeys(op: Op): readonly string[] | null {
  return 'keys' in op ? op.keys : null;
}

function matchesOp(pred: OpPredicate, op: Op): boolean {
  if (pred.op !== op.op) {
    return false;
  }
  if (pred.pathPrefix !== undefined) {
    // A root-addressed op (no `path`) reaches the document map itself, which
    // no path-prefixed predicate describes.
    if (op.path === undefined || !pathHasPrefix(op.path, pred.pathPrefix)) {
      return false;
    }
  }
  if (pred.keys !== undefined) {
    const keys = opKeys(op);
    if (keys === null || keys.length < pred.keys.length) {
      return false;
    }
    return pred.keys.every((key, i) => keys[i] === key);
  }
  return true;
}

/** Does `event` complete `step`? One step, one predicate — a step never
 * half-completes, so a wrong action simply leaves the coach mark where it is. */
export function stepDone(step: TutorialStep, event: TutorialEvent): boolean {
  const done = step.done;
  if ('ops' in done) {
    return (
      event.kind === 'ops' && done.ops.some((pred) => event.ops.some((op) => matchesOp(pred, op)))
    );
  }
  if ('selection' in done) {
    return (
      event.kind === 'selection' &&
      event.path !== null &&
      pathHasPrefix(event.path, done.selection.pathPrefix)
    );
  }
  if ('ui' in done) {
    return event.kind === 'ui' && event.id === done.ui;
  }
  if ('pageCount' in done) {
    return event.kind === 'pageCount' && event.count >= done.pageCount.min;
  }
  // An `auto` step is advanced by the Next button, never by an event.
  return false;
}

/** Every step of the course in order — the progress list's universe. */
export function courseSteps(course: TutorialCourse): readonly TutorialStep[] {
  return course.chapters.flatMap((chapter) => chapter.steps);
}

/** Every step id across a set of units (the course + its topics). Progress is
 * one flat list over this union, so a stored id is kept only when SOME unit
 * still declares it. */
export function allStepIds(units: readonly TutorialCourse[]): readonly string[] {
  return units.flatMap((unit) => courseSteps(unit).map((step) => step.id));
}

/** Where a resumed course picks up: the first step not yet completed, or null
 * when the whole course is done. Returns chapter + step INDICES so the caller
 * can seed the chapter's document. */
export function resumeAt(
  course: TutorialCourse,
  progress: TutorialProgress,
): { chapter: number; step: number } | null {
  const completed = new Set(progress.completed);
  for (let chapter = 0; chapter < course.chapters.length; chapter++) {
    const steps = course.chapters[chapter].steps;
    for (let step = 0; step < steps.length; step++) {
      if (!completed.has(steps[step].id)) {
        return { chapter, step };
      }
    }
  }
  return null;
}

/** How many of a chapter's steps are done — the launcher's per-chapter meter. */
export function chapterProgress(
  course: TutorialCourse,
  progress: TutorialProgress,
  chapter: number,
): { done: number; total: number } {
  const completed = new Set(progress.completed);
  const steps = course.chapters[chapter].steps;
  return { done: steps.filter((s) => completed.has(s.id)).length, total: steps.length };
}

/** Record a step as complete (idempotent — re-completing keeps one entry). */
export function markComplete(progress: TutorialProgress, stepId: string): TutorialProgress {
  if (progress.completed.includes(stepId)) {
    return progress;
  }
  return { ...progress, completed: [...progress.completed, stepId] };
}

/** Read persisted progress that a user could have hand-edited. Anything not
 * recognizable degrades to a fresh start — the worst case is re-offering the
 * tutorial, so the guard is deliberately strict. Step ids are kept only when
 * they name a REAL step of the course, which also stops a stored
 * `__proto__`/`constructor` string from ever reaching a lookup. `units` is the
 * course plus every topic, so a topic's completed ids survive a course reload. */
export function readProgress(raw: unknown, units: readonly TutorialCourse[]): TutorialProgress {
  const known = new Set(allStepIds(units));
  const source = typeof raw === 'string' ? parseStored(raw) : raw;
  if (source === null || typeof source !== 'object') {
    return EMPTY_PROGRESS;
  }
  const record = source as { completed?: unknown; dismissed?: unknown };
  const completed = Array.isArray(record.completed)
    ? record.completed.filter((id): id is string => typeof id === 'string' && known.has(id))
    : [];
  return { completed, dismissed: record.dismissed === true };
}

function parseStored(raw: string): unknown {
  if (raw.length > MAX_PROGRESS_BYTES) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Is this a UI event the schema admits? Guards data (a hand-authored or
 * AI-authored topic) before it reaches the matcher. */
export function isUiEvent(id: string): boolean {
  return (UI_EVENTS as readonly string[]).includes(id);
}
