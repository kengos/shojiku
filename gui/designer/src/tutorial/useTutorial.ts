// The tutorial controller: which step is showing, what completes it, and the
// practice-document swap around the whole session.
//
// The swap is the trust feature. Starting the course snapshots the reader's own
// document (text, sample data, name) and replaces it with a practice document;
// leaving — by finishing, by exiting, or because something threw mid-session —
// ALWAYS puts the reader's document back. That is why `stop` restores from a
// ref rather than from state: the restore must not depend on a render having
// happened.

import { useCallback, useMemo, useRef, useState } from 'react';
import type { AnchorRect } from './anchors';
import { EMPTY_PROGRESS, markComplete, readProgress, resumeAt, stepDone } from './model';
import { PRACTICE_PARAMS } from './seeds';
import type { TutorialCourse, TutorialEvent, TutorialProgress, TutorialStore } from './types';
import { useAnchorRect } from './useAnchorRect';

/** What the controller needs from the surrounding Designer to swap documents.
 * Passed in rather than reached for, so the controller stays testable without
 * an editor or a preview. */
export interface TutorialHost {
  /** The document text as it is right now (snapshotted at start). */
  currentText(): string;
  /** The sample-data text as it is right now. */
  currentParams(): string;
  /** Replace the whole document. */
  setText(text: string): void;
  /** Replace the sample data. */
  setParams(params: string): void;
}

export interface TutorialSession {
  /** The unit being run — the course, or one of the topics. */
  readonly unit: TutorialCourse;
  readonly chapter: number;
  readonly step: number;
}

export interface TutorialController {
  readonly session: TutorialSession | null;
  readonly progress: TutorialProgress;
  /** The rect of the current step's anchor, or null when it is off-screen. */
  readonly rect: AnchorRect | null;
  /** Re-read persisted progress (the launcher calls this as it opens — the
   * store is an accessor, never a boot-time snapshot). */
  reload(): TutorialProgress;
  /** Start (or resume) a unit at a chapter — the course, or a topic (one
   * chapter, so `chapter` is 0). Seeds that unit's practice document. */
  start(unit: TutorialCourse, chapter: number): void;
  stop(): void;
  /** Advance an explanation-only step (the Next button). */
  next(): void;
  /** Feed a document-model or UI event; completes the step when it matches. */
  observe(event: TutorialEvent): void;
  restart(): void;
  dismissHint(): void;
}

export function useTutorial(
  course: TutorialCourse,
  topics: readonly TutorialCourse[],
  host: TutorialHost,
  store?: TutorialStore,
): TutorialController {
  // The course plus every topic: the progress universe (so a topic's completed
  // ids are not filtered out when the course reloads) and the id-known set.
  const units = useMemo(() => [course, ...topics], [course, topics]);
  const [session, setSession] = useState<TutorialSession | null>(null);
  const [progress, setProgress] = useState<TutorialProgress>(EMPTY_PROGRESS);
  // The step's anchor is TRACKED, not captured: a fullscreen view (document
  // settings, the data-item editor) unmounts the panel a step points at while
  // that step is still showing, and a rect measured at open would leave the
  // ring behind on the old layout. A canvas step points at the page, not at
  // chrome, so it tracks nothing.
  const showing =
    session === null ? null : session.unit.chapters[session.chapter].steps[session.step];
  const rect = useAnchorRect(
    showing === null || showing.anchor.kind === 'canvas' ? null : showing.anchor.selector,
  );
  // The reader's own document, held outside React state so `stop` can restore
  // it from any code path — including an error handler.
  const snapshot = useRef<{ text: string; params: string } | null>(null);
  const hostRef = useRef(host);
  hostRef.current = host;

  const persist = useCallback(
    (next: TutorialProgress) => {
      setProgress(next);
      store?.save(next);
    },
    [store],
  );

  const showStep = useCallback((unit: TutorialCourse, chapter: number, step: number) => {
    setSession({ unit, chapter, step });
  }, []);

  // Read the store at OPEN time, never a boot snapshot: another tab (or the
  // host) may have written progress since this session mounted.
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const reload = useCallback((): TutorialProgress => {
    if (store === undefined) {
      return progressRef.current;
    }
    const stored = readProgress(store.load(), units);
    setProgress(stored);
    return stored;
  }, [store, units]);

  const start = useCallback(
    (unit: TutorialCourse, chapter: number) => {
      const stored = reload();
      if (snapshot.current === null) {
        snapshot.current = {
          text: hostRef.current.currentText(),
          params: hostRef.current.currentParams(),
        };
      }
      const at = resumeAt(unit, stored);
      const target = at !== null && at.chapter === chapter ? at.step : 0;
      hostRef.current.setText(unit.chapters[chapter].seed);
      hostRef.current.setParams(unit.params ?? PRACTICE_PARAMS);
      showStep(unit, chapter, target);
    },
    [reload, showStep],
  );

  const stop = useCallback(() => {
    const saved = snapshot.current;
    snapshot.current = null;
    setSession(null);
    if (saved !== null) {
      hostRef.current.setText(saved.text);
      hostRef.current.setParams(saved.params);
    }
  }, []);

  const complete = useCallback(
    (unit: TutorialCourse, chapter: number, step: number) => {
      const steps = unit.chapters[chapter].steps;
      persist(markComplete(progress, steps[step].id));
      if (step + 1 < steps.length) {
        showStep(unit, chapter, step + 1);
        return;
      }
      if (chapter + 1 < unit.chapters.length) {
        // The reader's own edits carry into the next chapter — the seed is for
        // ENTERING a chapter cold, not for overwriting work in progress.
        showStep(unit, chapter + 1, 0);
        return;
      }
      stop();
    },
    [progress, persist, showStep, stop],
  );

  const next = useCallback(() => {
    if (session === null) {
      return;
    }
    complete(session.unit, session.chapter, session.step);
  }, [session, complete]);

  const observe = useCallback(
    (event: TutorialEvent) => {
      if (session === null) {
        return;
      }
      const step = session.unit.chapters[session.chapter].steps[session.step];
      if (stepDone(step, event)) {
        complete(session.unit, session.chapter, session.step);
      }
    },
    [session, complete],
  );

  const restart = useCallback(() => {
    persist(EMPTY_PROGRESS);
  }, [persist]);

  const dismissHint = useCallback(() => {
    persist({ ...progress, dismissed: true });
  }, [persist, progress]);

  return {
    session,
    progress,
    rect,
    reload,
    start,
    stop,
    next,
    observe,
    restart,
    dismissHint,
  };
}
