// The decoration lines as two checkboxes, like a word processor's U and S: an
// underline and a strikethrough, each on or off, both at once allowed. They are
// ONE wire key (`textDecoration`), so each box reads its line out of the
// effective value and writes the whole value back (`decorationToggleOp`).
// Against an engine without `style.textDecoration.combined` the two boxes are
// exclusive — ticking one clears the other — because that engine refuses the
// two-token value. The origin line under them says where an unticked-by-the-
// item line comes from, as every typography row does.
//
// A value outside the wire's vocabulary is not shown verbatim (unlike the
// closed selects' `withAuthored`): the engine refuses any other
// `textDecoration` spelling at parse, so a document carrying one does not load
// and never reaches this control.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { decorationOf, hasLineThrough, hasUnderline } from '../text/spanRuns';
import type { CascadeContext } from '../toolbar/cascade';
import { effectiveValueIn } from '../toolbar/effective';
import { DecorationBoxes } from './DecorationBoxes';
import { applyPanelOp } from './model';
import { type DefaultsSection, OriginBadge } from './OriginBadge';
import { decorationToggleOp } from './textLookOps';

export interface DecorationChecksProps {
  readonly path: string;
  readonly controller: EditorController;
  readonly ctx: CascadeContext;
  /** The engine takes both lines at once. */
  readonly combined: boolean;
  readonly onNavigate?: (section: DefaultsSection) => void;
}

export function DecorationChecks({
  path,
  controller,
  ctx,
  combined,
  onNavigate,
}: DecorationChecksProps) {
  const { t } = useI18n();
  const effective = effectiveValueIn(ctx, 'textDecoration');
  const current = decorationOf(effective.value);
  return (
    <div className="mb-2">
      <DecorationBoxes
        current={current}
        onToggle={(line) =>
          applyPanelOp(controller, decorationToggleOp(path, effective, line, combined))
        }
      />
      <OriginBadge
        // The badge names the lines in words, not the wire's two-token value.
        effective={{
          ...effective,
          value:
            [
              hasUnderline(current) ? t('flow.underline') : '',
              hasLineThrough(current) ? t('flow.lineThrough') : '',
            ]
              .filter((part) => part !== '')
              .join(' + ') || t('panel.tableSection.none'),
        }}
        onNavigate={onNavigate}
      />
    </div>
  );
}
