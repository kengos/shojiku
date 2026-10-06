// What a repeat CELL or a repeat_flow CARD frame adds to its form beyond the
// decoration: its own size and how it arranges its children. A frame is a
// container on the wire (no `type:` of its own), so its arrangement is edited by
// the very `LayoutSection` a container item uses, pointed at the frame's path
// (`layoutModel` classifies the frame as a container). An empty size keeps the
// frame's default — "Auto" in the field, spelled out under it: a cell fills its
// cell on the sheet, a card is as wide as the list and as tall as its content.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { SECTION_TITLE } from '../ui/chrome';
import { BoxAxisField } from './boxFields';
import { boxOf } from './flexParticipants';
import type { FrameKind } from './frameModel';
import { display } from './itemView';
import { LayoutSection } from './LayoutSection';
import { containerLayoutFor } from './layoutModel';
import { readItem } from './placementModel';

const SIZE_STEP_PT = 1;

export function FrameLayoutSection({
  controller,
  path,
  kind,
  capabilities,
}: {
  readonly controller: EditorController;
  /** The frame's path (`…cell` / `…item`). */
  readonly path: string;
  readonly kind: Exclude<FrameKind, 'columnCell'>;
  readonly capabilities?: readonly string[];
}) {
  const { t } = useI18n();
  // The size is the frame's own whatever its arrangement says: a hostile
  // `box.type` withholds the arrangement controls, never the width and height.
  const box = boxOf(readItem(controller.read, path));
  const layout = containerLayoutFor(controller.read, path);
  const field = (axis: 'w' | 'h', label: string) => (
    <BoxAxisField
      label={label}
      authored={display(box[axis])}
      seed={null}
      step={SIZE_STEP_PT}
      axis={axis}
      path={path}
      controller={controller}
      emptyHint={t('panel.frame.size.auto')}
    />
  );
  return (
    <>
      <section className="mb-3">
        <h3 className={SECTION_TITLE}>{t('panel.frame.size')}</h3>
        <div className="grid grid-cols-2 gap-2">
          {field('w', t('panel.box.w'))}
          {field('h', t('panel.box.h'))}
        </div>
        {/* What empty means, under the fields rather than inside them: an input
            this narrow clips a sentence, and a placeholder vanishes the moment
            there is a value — exactly when "clear it to go back" is needed. */}
        <p className="mt-1 mb-0 text-[11px] text-muted leading-relaxed">
          {t(`panel.frame.size.hint.${kind}`)}
        </p>
      </section>
      {layout === null ? null : (
        <section className="mb-3">
          <h3 className={SECTION_TITLE}>{t('panel.layout.children')}</h3>
          <LayoutSection
            controller={controller}
            path={path}
            layout={layout}
            capabilities={capabilities}
          />
        </section>
      )}
    </>
  );
}
