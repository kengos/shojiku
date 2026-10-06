// The parent-first card at the top of the placement tab: the SAME child-layout controls
// wrapped for the selected item's PARENT container (tinted, with a select-parent
// jump), so a child selection edits the shared arrangement without hunting for
// the parent. Hovering or focusing it highlights the parent on canvas — the
// impact scope shown BEFORE a shared edit.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { BTN_SM, SECTION_TITLE } from '../ui/chrome';
import { GridSpanSection } from './GridSpanFields';
import { LayoutSection } from './LayoutSection';
import { type ContainerLayout, containerKindLabel } from './layoutModel';

export interface ParentContainerCardProps {
  readonly controller: EditorController;
  /** The PARENT container's path (one level up; never recursive). */
  readonly path: string;
  /** The selected CHILD's path: under a grid parent, the child's own span
   * fields follow the card (`GridSpanSection`). */
  readonly childPath?: string;
  readonly layout: ContainerLayout;
  /** Jump the shared selection to the parent container. */
  readonly onSelectParent?: (path: string) => void;
  /** Highlight the parent's outline+chip on canvas while the card is hovered
   * or focused — the impact scope shown BEFORE a shared edit. `null` clears. */
  readonly onHighlight?: (path: string | null) => void;
  /** The engine's capability keys; absent = the bundled engine. */
  readonly capabilities?: readonly string[];
}

export function ParentContainerCard({
  controller,
  path,
  layout,
  onSelectParent,
  onHighlight,
  capabilities,
  childPath,
}: ParentContainerCardProps) {
  const { t } = useI18n();
  return (
    <>
      <section
        aria-label={t('panel.layout.parent', { kind: containerKindLabel(t, layout) })}
        className="mb-3 rounded-md border border-border bg-bg p-2"
        onMouseEnter={() => onHighlight?.(path)}
        onMouseLeave={() => onHighlight?.(null)}
        onFocus={() => onHighlight?.(path)}
        onBlur={() => onHighlight?.(null)}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className={`${SECTION_TITLE} mb-0`}>
            {t('panel.layout.parent', { kind: containerKindLabel(t, layout) })}
          </h3>
          <button type="button" className={BTN_SM} onClick={() => onSelectParent?.(path)}>
            {t('panel.layout.selectParent')}
          </button>
        </div>
        <LayoutSection
          controller={controller}
          path={path}
          layout={layout}
          capabilities={capabilities}
        />
      </section>
      {childPath === undefined ? null : (
        <GridSpanSection
          controller={controller}
          path={childPath}
          parent={layout}
          capabilities={capabilities}
        />
      )}
    </>
  );
}
