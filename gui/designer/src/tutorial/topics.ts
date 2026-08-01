// The help-menu topic shorts: focused 2–3 minute tutorials on the shipped
// through-course engine. Each topic is a single-chapter `TutorialCourse` run by
// the same controller, so the matcher, coach mark, launcher and practice-swap
// are reused wholesale. A step that reuses a course sentence carries `copyId`
// (the single-source rule); its own `id` stays unique so per-topic progress
// never collides with the course or another topic.
//
// Practice documents reuse the course's already-diagnostics-clean chapter seeds
// where a topic needs that structure; the one topic that needs an empty footer
// to fill in carries its own seed (`TOPIC_SEEDS.footer`), pinned clean by the
// same integration suite as the chapter seeds.

import { TOUR_ANCHORS } from './anchors';
import { CHAPTER_SEEDS, TOPIC_SEEDS } from './seeds';
import type { TutorialStep, TutorialTopic } from './types';

const insertIntoBody = { op: 'insertItem', pathPrefix: 'sections.body.items' } as const;

/** A step reusing a course sentence: its own progress `id` + the `copyId` whose
 * copy it shows. */
function reuse(id: string, courseStepId: string, step: TutorialStep): TutorialStep {
  return { ...step, id, copyId: courseStepId };
}

function step(
  id: string,
  anchor: TutorialStep['anchor'],
  done: TutorialStep['done'],
): TutorialStep {
  return { id, anchor, done };
}

const menu = (selector: string) => ({ kind: 'menu', selector }) as const;
const toolbar = (selector: string) => ({ kind: 'toolbar', selector }) as const;
const panel = () => ({ kind: 'panel', selector: TOUR_ANCHORS.panel }) as const;
const sidebar = () => ({ kind: 'sidebar', selector: TOUR_ANCHORS.sidebarTabs }) as const;
const dataGear = () => ({ kind: 'sidebar', selector: TOUR_ANCHORS.dataEditorGear }) as const;
const canvas = (selector: string) => ({ kind: 'canvas', selector }) as const;
const dialog = () => ({ kind: 'dialog', selector: TOUR_ANCHORS.containerPicker }) as const;

/** One single-chapter unit. `id` is the topic id (its chapter id too). */
function topic(id: string, seed: string, steps: readonly TutorialStep[]): TutorialTopic {
  return { id, chapters: [{ id, seed, steps }] };
}

// Containers & layout — chapter 2 at the core, plus the trace-picker grid,
// column changes, and nesting.
const CONTAINERS = topic('topic-containers', CHAPTER_SEEDS.ch1, [
  reuse(
    'topic-containers.open',
    'ch2.openPicker',
    step('', menu(TOUR_ANCHORS.menuInsert), { ui: 'dialog:container' }),
  ),
  step('topic-containers.grid', dialog(), { ops: [insertIntoBody] }),
  step('topic-containers.columns', panel(), {
    ops: [{ op: 'setScalar', keys: ['box', 'columns'] }],
  }),
  step('topic-containers.nest', menu(TOUR_ANCHORS.menuInsert), { ops: [insertIntoBody] }),
  reuse(
    'topic-containers.gap',
    'ch2.gap',
    step('', panel(), { ops: [{ op: 'setScalar', keys: ['box', 'gap'] }] }),
  ),
]);

// Data binding — chapter 3. Rebinding an existing bind and adding/removing
// chips (this document already binds customer/date, so the copy says
// "fix", not "create").
const BINDING = topic('topic-binding', CHAPTER_SEEDS.ch4, [
  step('topic-binding.dataTab', sidebar(), { ui: 'tab:data' }),
  step('topic-binding.rebind', panel(), { ops: [{ op: 'setScalar', keys: ['data', 'key'] }] }),
  step('topic-binding.rechip', canvas('sections.body.items'), {
    ops: [{ op: 'setScalar', keys: ['text'] }],
  }),
  reuse('topic-binding.sample', 'ch3.sample', step('', dataGear(), { ui: 'sample:edited' })),
]);

// Tables (list data) — chapter 4, plus the paste-a-table-from-Excel variant.
const TABLE = topic('topic-table', CHAPTER_SEEDS.ch1, [
  reuse(
    'topic-table.open',
    'ch4.openIterable',
    step('', menu(TOUR_ANCHORS.menuInsert), { ui: 'dialog:iterable' }),
  ),
  reuse(
    'topic-table.create',
    'ch4.create',
    step('', { kind: 'dialog', selector: TOUR_ANCHORS.menuInsert }, { ops: [insertIntoBody] }),
  ),
  step('topic-table.paste', menu(TOUR_ANCHORS.menuInsert), { ops: [insertIntoBody] }),
  reuse(
    'topic-table.width',
    'ch4.width',
    step('', panel(), { ops: [{ op: 'setScalar', keys: ['width'] }] }),
  ),
  reuse(
    'topic-table.alignRight',
    'ch4.alignRight',
    step('', panel(), { ops: [{ op: 'setScalar', keys: ['style', 'textAlign'] }] }),
  ),
]);

// Footers & page numbers — chapter 6, on a practice document with an empty
// footer + an existing page number.
const FOOTER = topic('topic-footer', TOPIC_SEEDS.footer, [
  reuse(
    'topic-footer.select',
    'ch6.selectFooter',
    step('', sidebar(), { selection: { pathPrefix: 'sections.footer' } }),
  ),
  reuse(
    'topic-footer.text',
    'ch6.insertText',
    step('', menu(TOUR_ANCHORS.menuInsert), {
      ops: [{ op: 'insertItem', pathPrefix: 'sections.footer' }],
    }),
  ),
  reuse(
    'topic-footer.place',
    'ch6.place',
    step('', panel(), { ops: [{ op: 'setScalar', keys: ['box'] }] }),
  ),
  reuse(
    'topic-footer.everyPage',
    'ch6.everyPage',
    step('', canvas('sections.footer'), { auto: true }),
  ),
]);

// Fixed vs auto placement — pin a container child (text), move it, return it
// to auto and watch the reflow. The course's ch2.auto/ch7 mention chapters
// and images, so this topic carries its own copy.
const PLACEMENT = topic('topic-placement', CHAPTER_SEEDS.ch3, [
  step('topic-placement.explain', panel(), { auto: true }),
  step('topic-placement.pin', panel(), { ops: [{ op: 'setScalar', keys: ['box'] }] }),
  step('topic-placement.move', panel(), { ops: [{ op: 'setScalar', keys: ['box'] }] }),
  step('topic-placement.unpin', panel(), { ops: [{ op: 'removeKey', keys: ['box'] }] }),
]);

// Style & format provenance — this document's title uses the "title" style
// (already bold, 21pt). Order: read the origin badge → update the style and
// watch it follow → override directly so the origin flips to "this element"
// and following stops (the reverse order would let the override hide the
// update and contradict the story). ch1.bold/size/style collide with the
// existing style, so the topic carries its own copy.
const STYLE = topic('topic-style', CHAPTER_SEEDS.ch2, [
  step('topic-style.origin', panel(), { auto: true }),
  step('topic-style.update', toolbar(TOUR_ANCHORS.toolbarStyles), {
    ops: [{ op: 'setScalar', keys: ['styles'] }],
  }),
  step('topic-style.override', toolbar(TOUR_ANCHORS.toolbarFontSize), {
    ops: [{ op: 'setScalar', keys: ['style', 'fontSize'] }],
  }),
]);

/** The topic shorts, in launcher order. Each is a single-chapter unit. */
export const TOPICS: readonly TutorialTopic[] = [
  CONTAINERS,
  BINDING,
  TABLE,
  FOOTER,
  PLACEMENT,
  STYLE,
];
