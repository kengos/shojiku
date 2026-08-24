// Which repeating bands the document does NOT have. The layer tree shows a
// placeholder row for each, so a band-less document says where its header and
// footer WOULD go instead of simply omitting them — the omission is what made
// the bands unreachable (and what dead-ends the tutorial's footer chapter).
//
// Read off the BUILT tree rather than the source: `buildTree` has already
// parsed once, and a placeholder is a statement about what the tree shows.

import { BAND_NAMES, type BandName } from '../insert/bandCreate';
import { SECTION_PREFIX } from './labels';
import type { TreeView } from './model';

/** The bands with no row in `view`, in `sections:` order (header, footer).
 *
 * An unparseable document (`null`) and one with NO sections at all both yield
 * none: the first because nothing is known about it, the second because
 * `sections.body` is required on the wire — offering to create a header beside
 * a missing body would author a document the engine refuses. */
export function missingBands(view: TreeView | null): readonly BandName[] {
  if (view === null || view.roots.length === 0) {
    return [];
  }
  const present = new Set(view.roots.map((node) => node.kind));
  return BAND_NAMES.filter((band) => !present.has(`${SECTION_PREFIX}${band}`));
}
