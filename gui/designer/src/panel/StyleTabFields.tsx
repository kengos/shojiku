// The decoration tab's colour FIELD: the labeled swatch the fill/text-colour
// cluster renders (the typography rows are `TypographyFields`).
// `StyleSection.tsx` beside this file composes them with the border editor, the
// line stroke editor and the row-condition rules.
//
// Every field carries an `OriginBadge` — the cascade-effective value plus where
// it came from — so an unset control still says what the item renders at.

import type { EditorController } from '../editor/useEditor';
import type { cascadeContext } from '../toolbar/cascade';
import { effectiveValueIn } from '../toolbar/effective';
import { plainTextOp } from './model';
import { type DefaultsSection, OriginBadge } from './OriginBadge';
import { PanelColorRow } from './PanelColorRow';

/** One panel color row (text glyph color or box fill): a labeled swatch picker
 * over the cascade-effective color, with an origin badge. No hand-typed hex. */
export function PanelColorField({
  label,
  styleKey,
  ctx,
  path,
  controller,
  onNavigate,
}: {
  readonly label: string;
  readonly styleKey: string;
  readonly ctx: ReturnType<typeof cascadeContext>;
  readonly path: string;
  readonly controller: EditorController;
  readonly onNavigate?: (section: DefaultsSection) => void;
}) {
  const effective = effectiveValueIn(ctx, styleKey);
  return (
    <PanelColorRow
      label={label}
      value={effective.value}
      onCommit={(v) => controller.apply(plainTextOp(path, ['style', styleKey], v))}
    >
      <OriginBadge effective={effective} onNavigate={onNavigate} />
    </PanelColorRow>
  );
}
