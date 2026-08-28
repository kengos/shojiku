// Whether a `char_grid` INTERPRETS its content, and the op that switches it.
//
// Separate from `charGridInk.ts` and `charGrid.ts` because it answers a different
// question from either: not how big the grid is and not what is drawn in it, but
// whether the characters in the bound data mean what they say. `《》`, `｜` and
// `［＃…］` are ordinary characters in a template's params until this key is
// present; with it they become ruby, an explicit base start, and the Aozora Bunko
// notes. That is a CONTENT-interpretation switch over data the template does not
// control, which is why it belongs on the content tab and why the control says so.
//
// Two engine facts decide the shape of the control, both read from the source:
//
//   * `enum Markup` (`engine/core/src/template/char_grid.rs:129`) has exactly ONE
//     variant, `Aozora`, and the item holds it as `Option<Markup>`. So "off" is the
//     key being ABSENT — there is no `none` to author — and the control is a
//     toggle, never a three-state select.
//   * `markup` sits at the item ROOT, a sibling of `grid` and `text`, not under
//     `style` (`examples/typography/genkoyoshi-ja/templates.yml:26`).

import type { Op, ReadFn } from '@shojiku/designer-core';
import { record } from './itemView';
import { plainTextOp } from './model';

/** The engine capability the toggle is gated on. An engine that lacks it parses
 * `markup: aozora` as an unknown value, so the control must not be offered — the
 * key already exists in the engine's own list and none is invented here. */
export const CHAR_GRID_MARKUP_CAPABILITY = 'char_grid.markup.aozora';

/** The only markup grammar the wire has. */
const AOZORA = 'aozora';

/** Whether the item at `path` interprets its content. Anything other than the one
 * known spelling reads as OFF — a document carrying a markup value this Designer
 * does not know is not something to render a half-on toggle for. */
export function readCharGridMarkup(read: ReadFn, path: string): boolean {
  return record(read(path))?.markup === AOZORA;
}

/** Turn content interpretation on or off. On authors the single legal value; off
 * REMOVES the key, because absence is what "verbatim" is spelled as. */
export function markupOp(path: string, on: boolean): Op {
  return plainTextOp(path, ['markup'], on ? AOZORA : '');
}
