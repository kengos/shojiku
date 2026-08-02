// The tutorial's declarative step schema. A step is one sentence of copy, one
// anchor to point at, and one completion predicate — and the predicate is
// expressed over things the DOCUMENT MODEL reports (committed ops, the
// selection path, the rendered page count) plus a small closed set of UI events
// our own handlers emit. Nothing here inspects the DOM to decide "done", so an
// AI can author a tutorial the same way it authors a template: as data.

import type { Op } from '@shojiku/designer-core';

/** Which surface a step points at. `canvas` resolves through the selection
 * path → the engine's box index; every other kind resolves a `data-tour` id. */
export type AnchorKind = 'menu' | 'toolbar' | 'panel' | 'sidebar' | 'dialog' | 'canvas';

export interface StepAnchor {
  readonly kind: AnchorKind;
  /** A `data-tour` id (chrome kinds) or a document path prefix (`canvas`). */
  readonly selector: string;
}

/** The UI events a step may wait on — a CLOSED set, emitted by the Designer's
 * own handlers. Anything expressible as a committed op stays an op predicate;
 * these cover the moments that change no template bytes (a dialog opening, a
 * sample-data edit, an export). */
export const UI_EVENTS = [
  'dialog:container',
  'dialog:field',
  'dialog:iterable',
  'sample:edited',
  'export:done',
  'tab:data',
] as const;

export type UiEventId = (typeof UI_EVENTS)[number];

/** Match a committed op: its kind, optionally the leading key path it writes
 * (`['box','gap']` matches a write to `box.gap`) and the document path it
 * addresses. An absent field is a wildcard. */
export interface OpPredicate {
  readonly op: Op['op'];
  readonly keys?: readonly string[];
  readonly pathPrefix?: string;
}

/** How a step completes. `auto` steps are read-only explanations the user
 * dismisses with Next. */
export type StepDone =
  | { readonly ops: readonly OpPredicate[] }
  | { readonly selection: { readonly pathPrefix: string } }
  | { readonly ui: UiEventId }
  | { readonly pageCount: { readonly min: number } }
  | { readonly auto: true };

export interface TutorialStep {
  /** Stable id — the PROGRESS key, unique across every unit (course + topics),
   * so completing a step in one unit never marks another's as done. */
  readonly id: string;
  /** The step id whose COPY this step shows, when it reuses a course step's
   * sentence — the single-source rule. Absent → the copy is keyed by `id`. */
  readonly copyId?: string;
  readonly anchor: StepAnchor;
  readonly done: StepDone;
}

export interface TutorialChapter {
  readonly id: string;
  /** The document this chapter starts from, so a chapter can be entered
   * directly. Chapter 0 starts blank. */
  readonly seed: string;
  readonly steps: readonly TutorialStep[];
}

export interface TutorialCourse {
  readonly id: string;
  readonly chapters: readonly TutorialChapter[];
  /** The sample data the practice document binds. Absent → the shared course
   * `PRACTICE_PARAMS`. A topic that reuses a chapter seed inherits its data. */
  readonly params?: string;
}

/** A topic short is structurally a single-chapter course — same runner, same
 * matcher, its own practice document and progress. */
export type TutorialTopic = TutorialCourse;

/** What the controller feeds the matcher. Every variant originates in the
 * document model or an enumerated UI event — never a DOM observation. */
export type TutorialEvent =
  | { readonly kind: 'ops'; readonly ops: readonly Op[] }
  | { readonly kind: 'selection'; readonly path: string | null }
  | { readonly kind: 'ui'; readonly id: UiEventId }
  | { readonly kind: 'pageCount'; readonly count: number };

/** Persisted per-user progress. `completed` holds step ids (not indices), so
 * re-ordering or inserting steps never silently marks new work as done. */
export interface TutorialProgress {
  readonly completed: readonly string[];
  /** The first-run suggestion was dismissed. */
  readonly dismissed: boolean;
}

/** The host seam for persisting progress. Absent → progress is in-memory for
 * the session (the component never assumes a browser storage API). */
export interface TutorialStore {
  load(): unknown;
  save(progress: TutorialProgress): void;
}
