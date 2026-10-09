// Creating `spans:` from a plain `text:` item — the write the flow surface
// makes when a reader marks part of a static text. The surface itself is the
// one spans items already use; what is new is only that it now OPENS on a plain
// item too, and what its commit authors there:
//   - no mark anywhere → the plain `text:` write, byte for byte what the plain
//     editor would have made (an unchanged edit authors nothing at all), so an
//     item nobody formatted never acquires a `spans:` key;
//   - any mark → ONE batch that writes the fragments as `spans:` and removes the
//     `text:` the engine would otherwise report as `span_content_conflict`.
// Everything else on the item — `bindings:`, `ruby:`, `mark:`, `link:`, the
// block `style:` — stays where it is: the engine reads each of them over a
// spans block exactly as over a plain one.
//
// It also answers the question the reader is owed BEFORE that happens: which of
// the item's settings the engine treats differently once it holds spans
// (`conversionCauses`).

import type { Op, ReadFn, SnippetValue } from '@shojiku/designer-core';
import { commitOps, declarationBatch } from '../text/declCommit';
import type { PendingDecl } from '../text/declModel';
import { otherSurfaceNames, readItem } from '../text/declModel';
import type { SerializedRun } from '../text/runSerialize';
import { NO_MARKS, narrowRuns, type RunView, sameMarks } from '../text/spanRuns';
import { cascadeContext } from '../toolbar/cascade';
import { effectiveValueIn } from '../toolbar/effective';
import { readContainerNode } from './containerNode';
import { boxOf } from './flexParticipants';
import { hasCapability } from './itemPanelProps';
import { inBasisPopulation } from './layoutModel';
import { MAX_SPANS } from './spansModel';
import { markStyleValue, type SnippetMap } from './spanWire';
import { VERTICAL_RL } from './typesettingModel';

/** Vertical writing on surfaces past a plain block, `spans` among them. */
const SURFACES_CAPABILITY = 'style.writingMode.surfaces';

/** The flow surface over a plain item: its whole text as ONE unmarked run. */
export function plainRun(text: string): RunView {
  return {
    index: 0,
    kind: 'text',
    content: text,
    marks: NO_MARKS,
    hasStyleNames: false,
    linked: false,
  };
}

function unmarked(runs: readonly SerializedRun[]): boolean {
  return runs.every((run) => run.kind === 'text' && !run.linked && sameMarks(run.marks, NO_MARKS));
}

function joined(runs: readonly SerializedRun[]): string {
  return runs.map((run) => (run.kind === 'text' ? run.content : '')).join('');
}

/** One fragment's wire map. A bound fragment cannot be minted on a plain item
 * (the surface authors a bound value as a `{key}` chip in a fragment's text),
 * but the serializer's type admits one, and writing it back as what it is costs
 * one line where dropping it would cost the reader a value. */
function fragmentValue(run: SerializedRun): SnippetValue {
  const style = markStyleValue(run.marks);
  const content: SnippetMap =
    run.kind === 'text' ? { text: run.content } : { data: { key: run.content } };
  return style === undefined ? content : { ...content, style };
}

export interface PlainCommitInput {
  readonly read: ReadFn;
  readonly path: string;
  /** The `text:` the surface was seeded from. */
  readonly oldText: string;
  readonly runs: readonly SerializedRun[];
  readonly pending: readonly PendingDecl[];
}

/** The ONE batch a flow-surface commit over a PLAIN item applies — empty when
 * nothing changed, so no step lands on the undo stack; `null` when the edit is
 * REFUSED: more fragments than the engine draws (`MAX_SPANS` — it applies the
 * first ones and drops the tail of the text), which the caller treats like a
 * refused batch and keeps the surface open.
 *
 * "Nothing marked" is decided on the fragments that SURVIVE: an emptied run
 * element can still carry a mark (bold a word, delete it), and converting for
 * a mark on no text would cost the item every `conversionCauses` difference
 * for nothing. */
export function plainFlowCommitOps(input: PlainCommitInput): readonly Op[] | null {
  const { read, path, oldText, runs, pending } = input;
  const newText = joined(runs);
  const fragments = runs.filter((run) => run.kind !== 'text' || run.content !== '');
  if (unmarked(fragments)) {
    return newText === oldText ? [] : commitOps({ read, path, oldText, newText, pending });
  }
  if (fragments.length > MAX_SPANS) {
    return null;
  }
  const item = readItem(read, path);
  // Removed only when present: `removeKey` on an absent key fails, and
  // `applyAll` then discards the whole batch — the reader's typing with it.
  const dropText: readonly Op[] =
    item !== undefined && Object.hasOwn(item, 'text')
      ? [{ op: 'removeKey', path, keys: ['text'] }]
      : [];
  return [
    { op: 'putValue', path, keys: ['spans'], value: fragments.map(fragmentValue) },
    ...dropText,
    ...declarationBatch({ read, path, oldText, newText, pending, others: otherSurfaceNames(item) }),
  ];
}

/** What changes in the engine's hands once this item holds spans:
 *  - `shrink` / `ellipsis` — the item's `textOverflow` (one value, so at most
 *    one of the two) is not modelled per span (`span_overflow_unsupported`;
 *    the text overflows like `visible`);
 *  - `width` — a horizontal text the engine sizes something from (a widthless
 *    row child, a child of a grid with an `auto` column, or such a child's
 *    widthless flex containers — `measuredChild`) is no longer measured once
 *    it holds spans;
 *  - `hanging` — hanging punctuation is not applied to horizontal spans. */
export type ConversionCause = 'shrink' | 'ellipsis' | 'width' | 'hanging';

const PARENT = /^(.*)\.items\[\d+\]$/;

/** Whether the engine sizes this item — or a container it sits in — from its
 * measured text. The engine measures a widthless child (`intrinsic/leaf.rs`):
 * a ROW sizes it from its text unless its basis is `0`; a GRID does for an
 * `auto` column (`grid/cells.rs`); and a widthless flex container's own
 * measurement RECURSES into its widthless children (a grid's does not), so a
 * text nested in widthless containers still sizes the row or grid above them.
 * The walk climbs while each level is a widthless flex child of a flex
 * container and answers at the first row or grid that measures.
 *
 * Which grid column a child lands in is not worked out — auto-placement is the
 * engine's — so a grid mixing `auto` with sized columns is answered for every
 * child, and a row child with basis `0` keeps climbing (its row may itself be
 * measured): a note that may be unneeded, never a change left untold. */
function measuredChild(read: ReadFn, path: string): boolean {
  let at = path;
  let node: unknown = readItem(read, path);
  for (let parent = PARENT.exec(at)?.[1]; parent !== undefined; parent = PARENT.exec(at)?.[1]) {
    const container = readContainerNode(read, parent);
    if (container === null || !inBasisPopulation(node)) {
      return false;
    }
    if (container.mode === 'grid') {
      const columns = container.box.columns;
      return Array.isArray(columns) && columns.includes('auto');
    }
    if (container.mode === 'row' && boxOf(node).flexBasis !== 0) {
      return true;
    }
    at = parent;
    node = readItem(read, parent);
  }
  return false;
}

/** The causes that apply to the plain item at `path`, in a fixed order. */
export function conversionCauses(read: ReadFn, path: string): readonly ConversionCause[] {
  const ctx = cascadeContext(read, path);
  const out: ConversionCause[] = [];
  const overflow = effectiveValueIn(ctx, 'textOverflow').value;
  if (overflow === 'shrink' || overflow === 'ellipsis') {
    out.push(overflow);
  }
  // A vertical block has no width-intrinsic size in the engine, plain or not,
  // so converting one changes nothing there.
  const vertical = effectiveValueIn(ctx, 'writingMode').value === VERTICAL_RL;
  if (!vertical && measuredChild(read, path)) {
    out.push('width');
  }
  const hanging = effectiveValueIn(ctx, 'hangingPunctuation').value;
  if (!vertical && hanging !== '' && hanging !== 'none') {
    out.push('hanging');
  }
  return out;
}

/** The engine renders a `spans:` block — and, for a VERTICAL one, renders it
 * vertically (older engines fall back to horizontal with a warning, which would
 * turn a reader's bold word into a layout change). Absent capabilities = the
 * bundled engine, which declares both. */
export function spansAuthorable(
  capabilities: readonly string[] | undefined,
  vertical: boolean,
): boolean {
  return (
    hasCapability(capabilities, 'text.spans') &&
    (!vertical || hasCapability(capabilities, SURFACES_CAPABILITY))
  );
}

/** Offer the per-fragment tate-chu-yoko toggle: on an engine honouring it per
 * span, while the block is vertical (the only place it draws) or while some
 * fragment already carries one (so it can be cleared). */
export function combineOffered(
  capabilities: readonly string[] | undefined,
  vertical: boolean,
  runs: readonly RunView[],
): boolean {
  return (
    hasCapability(capabilities, 'style.textCombineUpright.all') &&
    hasCapability(capabilities, SURFACES_CAPABILITY) &&
    (vertical || runs.some((run) => run.marks.combine !== ''))
  );
}

/** The block's cascade-effective writing mode is vertical. */
export function verticalBlock(read: ReadFn, path: string): boolean {
  return effectiveValueIn(cascadeContext(read, path), 'writingMode').value === VERTICAL_RL;
}

/** What a double-click opens over a text item: the flow surface's seed and
 * which item it is over, or `runs: null` for the PLAIN editor; `null` when the
 * item opens nothing (a data-bound text).
 *
 * `spans` wins over `text`/`data` when non-empty, so a spans-carrying item opens
 * the flow surface WHATEVER its content mode says — the `text:` the mode is
 * derived from is a key the engine is ignoring. A plain static text opens it
 * too, on an engine that renders spans; elsewhere it keeps the plain editor. */
export function flowSeed(
  read: ReadFn,
  path: string,
  view: { readonly hasSpans: boolean; readonly contentMode: string; readonly text: string },
  capabilities: readonly string[] | undefined,
): {
  readonly runs: readonly RunView[] | null;
  readonly origin: 'plain' | 'spans';
  readonly vertical: boolean;
} | null {
  const vertical = verticalBlock(read, path);
  if (view.hasSpans) {
    return { runs: narrowRuns(readItem(read, path)?.spans), origin: 'spans', vertical };
  }
  if (view.contentMode !== 'text') {
    return null;
  }
  const runs = spansAuthorable(capabilities, vertical) ? [plainRun(view.text)] : null;
  return { runs, origin: 'plain', vertical };
}
