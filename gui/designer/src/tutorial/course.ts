// The through-course ("your first invoice"): blank document → exported invoice in
// nine chapters. Structure only — every sentence the user reads lives in
// `copy.ja.ts`/`copy.en.ts`, keyed by step id, so a topic tutorial can reuse a
// step's copy by referencing its id.
//
// Each chapter carries the document it STARTS from, so a user can jump to (or
// resume at) any chapter and find the page in the state the copy describes.
// Completion is always an op the user's action commits, the selection they
// make, the page count they produce, or one of the enumerated UI events —
// never a DOM observation.
// line-budget-exempt: data table — splitting it adds no cohesion

import { TOUR_ANCHORS } from './anchors';
import { CHAPTER_SEEDS } from './seeds';
import type { TutorialChapter, TutorialCourse, TutorialStep } from './types';

const insertIntoBody = { op: 'insertItem', pathPrefix: 'sections.body.items' } as const;

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
// The gear on the data-items tab that opens the fullscreen data-item editor —
// where sample values (and definitions) are now edited.
const dataGear = () => ({ kind: 'sidebar', selector: TOUR_ANCHORS.dataEditorGear }) as const;
const canvas = (selector: string) => ({ kind: 'canvas', selector }) as const;

const CHAPTERS: readonly TutorialChapter[] = [
  {
    id: 'ch0',
    seed: CHAPTER_SEEDS.ch0,
    steps: [
      step('ch0.blank', canvas('sections.body'), { auto: true }),
      // The route in, then the page it opens — NOT the property panel, which
      // the document-settings view replaces the moment the reader presses it.
      step(
        'ch0.pageSize',
        { kind: 'panel', selector: TOUR_ANCHORS.panelDocSettings },
        {
          auto: true,
        },
      ),
      step(
        'ch0.margin',
        { kind: 'panel', selector: TOUR_ANCHORS.docSettings },
        {
          ops: [{ op: 'setScalar', keys: ['page', 'margin'] }],
        },
      ),
    ],
  },
  {
    id: 'ch1',
    seed: CHAPTER_SEEDS.ch1,
    steps: [
      step('ch1.insertText', menu(TOUR_ANCHORS.menuInsert), { ops: [insertIntoBody] }),
      step('ch1.type', canvas('sections.body.items'), {
        ops: [{ op: 'setScalar', keys: ['text'] }],
      }),
      step('ch1.bold', toolbar(TOUR_ANCHORS.toolbarBold), {
        ops: [{ op: 'setScalar', keys: ['style', 'fontWeight'] }],
      }),
      step('ch1.size', toolbar(TOUR_ANCHORS.toolbarFontSize), {
        ops: [{ op: 'setScalar', keys: ['style', 'fontSize'] }],
      }),
      step('ch1.align', toolbar(TOUR_ANCHORS.toolbarAlign), {
        ops: [{ op: 'setScalar', keys: ['style', 'textAlign'] }],
      }),
      step('ch1.style', toolbar(TOUR_ANCHORS.toolbarStyles), {
        ops: [{ op: 'putValue', keys: ['styles'] }],
      }),
    ],
  },
  {
    id: 'ch2',
    seed: CHAPTER_SEEDS.ch2,
    steps: [
      step('ch2.openPicker', menu(TOUR_ANCHORS.menuInsert), { ui: 'dialog:container' }),
      step(
        'ch2.pick',
        { kind: 'dialog', selector: TOUR_ANCHORS.containerPicker },
        {
          ops: [insertIntoBody],
        },
      ),
      step('ch2.left', canvas('sections.body.items'), {
        ops: [{ op: 'setScalar', keys: ['text'] }],
      }),
      step('ch2.rest', canvas('sections.body.items'), {
        ops: [{ op: 'setScalar', keys: ['text'] }],
      }),
      step('ch2.gap', panel(), { ops: [{ op: 'setScalar', keys: ['box', 'gap'] }] }),
      step('ch2.ratio', panel(), { ops: [{ op: 'setScalar', keys: ['box', 'flexGrow'] }] }),
      step('ch2.auto', panel(), { auto: true }),
    ],
  },
  {
    id: 'ch3',
    seed: CHAPTER_SEEDS.ch3,
    steps: [
      step('ch3.openField', menu(TOUR_ANCHORS.menuInsert), { ui: 'dialog:field' }),
      step(
        'ch3.create',
        { kind: 'dialog', selector: TOUR_ANCHORS.dialogField },
        {
          ops: [insertIntoBody, { op: 'setScalar', keys: ['data', 'key'] }],
        },
      ),
      step('ch3.dataTab', sidebar(), { ui: 'tab:data' }),
      step('ch3.bind', canvas('sections.body.items'), {
        ops: [insertIntoBody, { op: 'setScalar', keys: ['data', 'key'] }],
      }),
      step('ch3.chip', canvas('sections.body.items'), {
        ops: [{ op: 'setScalar', keys: ['text'] }],
      }),
      step('ch3.sample', dataGear(), { ui: 'sample:edited' }),
      step('ch3.format', panel(), { ops: [{ op: 'setScalar', keys: ['data', 'format'] }] }),
    ],
  },
  {
    id: 'ch4',
    seed: CHAPTER_SEEDS.ch4,
    steps: [
      step('ch4.openIterable', menu(TOUR_ANCHORS.menuInsert), { ui: 'dialog:iterable' }),
      step(
        'ch4.create',
        { kind: 'dialog', selector: TOUR_ANCHORS.dialogIterable },
        {
          ops: [insertIntoBody],
        },
      ),
      step('ch4.drawn', canvas('sections.body.items'), { auto: true }),
      step('ch4.width', panel(), { ops: [{ op: 'setScalar', keys: ['width'] }] }),
      step('ch4.alignRight', panel(), {
        ops: [{ op: 'setScalar', keys: ['style', 'textAlign'] }],
      }),
      step('ch4.paginate', dataGear(), { pageCount: { min: 2 } }),
    ],
  },
  {
    id: 'ch5',
    seed: CHAPTER_SEEDS.ch5,
    steps: [
      step('ch5.container', menu(TOUR_ANCHORS.menuInsert), { ops: [insertIntoBody] }),
      step('ch5.total', canvas('sections.body.items'), {
        ops: [{ op: 'setScalar', keys: ['text'] }],
      }),
      step('ch5.ratio', panel(), { ops: [{ op: 'setScalar', keys: ['box', 'flexGrow'] }] }),
      step('ch5.bold', toolbar(TOUR_ANCHORS.toolbarBold), {
        ops: [{ op: 'setScalar', keys: ['style', 'fontWeight'] }],
      }),
    ],
  },
  {
    id: 'ch6',
    seed: CHAPTER_SEEDS.ch6,
    steps: [
      // The chapter's own dead end, repaired: the seed authors no footer, and
      // the tree shows no row for a section the document lacks — so the old
      // "select the footer" step could never be satisfied. The placeholder row
      // is now what the reader presses, which teaches the affordance instead
      // of presupposing its result. Selecting is what creating DOES, so this
      // replaces the select step rather than sitting in front of it.
      step('ch6.createFooter', sidebar(), {
        ops: [{ op: 'putValue', keys: ['sections', 'footer'] }],
      }),
      step('ch6.insertText', menu(TOUR_ANCHORS.menuInsert), {
        ops: [{ op: 'insertItem', pathPrefix: 'sections.footer' }],
      }),
      step('ch6.place', panel(), { ops: [{ op: 'setScalar', keys: ['box'] }] }),
      step('ch6.pageNumber', menu(TOUR_ANCHORS.menuInsert), {
        ops: [{ op: 'insertItem', pathPrefix: 'sections.footer' }],
      }),
      step('ch6.everyPage', canvas('sections.footer'), { auto: true }),
    ],
  },
  {
    id: 'ch7',
    seed: CHAPTER_SEEDS.ch7,
    steps: [
      step('ch7.image', menu(TOUR_ANCHORS.menuInsert), { ops: [insertIntoBody] }),
      step('ch7.pin', panel(), { ops: [{ op: 'setScalar', keys: ['box'] }] }),
      step('ch7.move', panel(), { ops: [{ op: 'setScalar', keys: ['box'] }] }),
    ],
  },
  {
    id: 'ch8',
    seed: CHAPTER_SEEDS.ch8,
    steps: [
      step(
        'ch8.diagnostics',
        { kind: 'panel', selector: TOUR_ANCHORS.diagnostics },
        {
          auto: true,
        },
      ),
      step('ch8.sample', dataGear(), { ui: 'sample:edited' }),
      step('ch8.export', menu(TOUR_ANCHORS.menuFile), { ui: 'export:done' }),
      step('ch8.done', canvas('sections.body'), { auto: true }),
    ],
  },
];

/** The through-course. Its id prefixes every step id. */
export const COURSE: TutorialCourse = { id: 'invoice', chapters: CHAPTERS };
