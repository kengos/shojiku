// The ONE target select both anchor pickers render — an ellipse's "circle an
// item" and a line endpoint's "attach to an item" — so the two cannot disagree
// about what is offered, how it is labelled, or what picking writes.
//
// Options are the document's items (`useAnchorTargets`), labelled as the layer
// tree labels them and numbered where two would read the same
// (`anchorOptions`), keyed by PATH (an unnamed item has no id to key by).
// Picking hands the caller the id to write plus the ops that name the target
// first when it has none (`ids/anchorTargets` `pickTarget`); the caller runs
// both in one batch. An authored value outside the list is appended VERBATIM —
// shown clipped, written exact — or any edit would silently re-point the anchor.

import { useI18n } from '../i18n/context';
import { type PickedTarget, pickTarget } from '../ids/anchorTargets';
import type { IdHolder } from '../ids/walk';
import { optionTexts } from './anchorOptions';
import { anchorLabel } from './ellipseAnchor';
import type { AnchorTargets } from './useAnchorTargets';

export interface AnchorTargetSelectProps {
  /** The select's DOM id, for the caller's `<label htmlFor>`. */
  readonly id: string;
  readonly targets: AnchorTargets;
  /** The authored target id; `''` when there is none yet. */
  readonly value: string;
  /** The empty option's text while nothing is chosen (a prompt, or the reason
   * nothing is offered). */
  readonly blank: string;
  readonly className: string;
  readonly onPick: (picked: PickedTarget) => void;
}

/** The section an index path lies in — every one starts `sections.<name>.`. */
const sectionOf = (holder: IdHolder) => holder.path.split('.')[1];

/** `p:<path>` for an offered item, `v:<id>` for an authored value outside the
 * list — two namespaces, so no id can be mistaken for a path. */
const keyOf = (holder: IdHolder) => `p:${holder.path}`;

export function AnchorTargetSelect({
  id,
  targets,
  value,
  blank,
  className,
  onPick,
}: AnchorTargetSelectProps) {
  const { t } = useI18n();
  const { index, candidates } = targets;
  const listed = candidates.find((holder) => holder.id !== undefined && holder.id === value);
  const selected = value === '' ? '' : listed !== undefined ? keyOf(listed) : `v:${value}`;
  const texts = optionTexts(candidates, t);
  // An authored target NO node carries says so — the anchor draws nothing. One
  // a node carries but the list leaves out (an item in a repeat) is shown as
  // written; so is any value while the namespace is partial (unknowable).
  const missing = !index.truncated && !index.holders.some((holder) => holder.id === value);
  const verbatim = missing
    ? t('panel.anchor.missing', { label: anchorLabel(value) })
    : anchorLabel(value);
  const option = (holder: IdHolder) => (
    <option key={holder.path} value={keyOf(holder)}>
      {texts.get(holder.path)}
    </option>
  );
  // Grouped by section the way the layer tree is, once there is more than one.
  const sections = [...new Set(candidates.map(sectionOf))];
  const body =
    sections.length > 1
      ? sections.map((section) => (
          <optgroup key={section} label={t(`tree.section.${section}`)}>
            {candidates.filter((h) => sectionOf(h) === section).map(option)}
          </optgroup>
        ))
      : candidates.map(option);
  return (
    <select
      id={id}
      className={className}
      value={selected}
      disabled={candidates.length === 0 && value === ''}
      onChange={(event) => {
        // The verbatim option is the CURRENT value, so choosing it changes
        // nothing; only an offered item picks.
        const holder = candidates.find((h) => keyOf(h) === event.currentTarget.value);
        if (holder !== undefined) {
          onPick(pickTarget(holder, index));
        }
      }}
    >
      {/* The prompt only while nothing is chosen: an anchor has no empty
          state to go back to (`anchor: ''` resolves to no item). */}
      {value === '' && <option value="">{blank}</option>}
      {body}
      {selected.startsWith('v:') && <option value={selected}>{verbatim}</option>}
    </select>
  );
}
