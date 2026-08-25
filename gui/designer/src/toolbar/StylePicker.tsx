// The format toolbar's named-style picker: the gdoc "Normal text" dropdown.
//
// Two things make it more than a checkbox list. Each row renders the style's
// NAME in a chrome approximation of that style (on the shared paper tint, so
// authored colour/background read truthfully in both themes) and states the
// style's document-wide usage count BEFORE it is applied — the "show the impact
// scope of a shared edit" rule. And after a separator it carries the
// selection→style capture actions, whose modal lives at the toolbar root so it
// survives this popover closing on the tail-row click.

import type { EditorController } from '../editor/useEditor';
import { usePopover } from '../hooks/usePopover';
import { useI18n } from '../i18n/context';
import { usageLabel } from '../i18n/usageLabel';
import type { ItemView } from '../panel/itemView';
import { styleNamesOp, toggleStyleName } from '../panel/model';
import { readStylesView } from '../panel/stylesModel';
import { PREVIEW_CHIP, stylePreview } from '../styles/preview';
import type { StyleUsage } from '../styles/usage';
import { TOUR_ANCHORS } from '../tutorial/anchors';
import { IconCheck } from '../ui/icons';
import { TipBubble } from '../ui/TipBubble';
import { Caret, FMT_BTN, FMT_POPOVER } from './fmtChrome';

/** The named-style picker: the trigger shows the applied style's name (gdoc's
 * "Normal text" placeholder when none), the menu is a checkbox list over the
 * registry ∪ the item's own names, each row stating the style's document-wide
 * usage count before it is applied. Toggling a name is ONE `styleNames` op
 * (one undo step). */
export function StylePicker({
  view,
  path,
  controller,
  usage,
  options,
  triggerLabel,
  canCapture,
  updateTarget,
  onSaveAs,
  onUpdate,
}: {
  readonly view: ItemView;
  readonly path: string;
  readonly controller: EditorController;
  readonly usage: StyleUsage | null;
  /** The registry ∪ the item's own names (parent-computed — it also gates the
   * picker's visibility). */
  readonly options: readonly string[];
  /** The trigger's visible text: the applied style's name, or the localized
   * "normal text" placeholder. */
  readonly triggerLabel: string;
  /** The selection has ≥1 capturable inline prop (offers "save as style"). */
  readonly canCapture: boolean;
  /** The highest-precedence real applied style (offers "update to match"), or
   * `null` when the item applies no registered style. */
  readonly updateTarget: string | null;
  readonly onSaveAs: () => void;
  readonly onUpdate: (target: string) => void;
}) {
  const { t } = useI18n();
  const { open, setOpen, rootRef } = usePopover();
  const styles = controller.read('styles');
  // The gdoc-style preview reads each entry's OWN props off the controlled
  // `readStylesView` projection (a safe Map lookup, never a raw hostile-map
  // index); a name with no registry entry (a dangling reference) previews plain.
  const previews = new Map(readStylesView(styles).map((entry) => [entry.name, entry.style]));
  return (
    <div className="group/tip relative" ref={rootRef}>
      {open ? null : <TipBubble text={t('toolbar.styles')} />}
      <button
        type="button"
        className={FMT_BTN}
        aria-haspopup="menu"
        aria-expanded={open}
        data-tour={TOUR_ANCHORS.toolbarStyles}
        aria-label={t('toolbar.styles')}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="max-w-[130px] truncate">{triggerLabel}</span>
        <Caret />
      </button>
      {open ? (
        <div role="menu" className={`${FMT_POPOVER} flex min-w-[180px] max-w-[280px] flex-col p-1`}>
          {options.map((name) => {
            const on = view.styleNames.includes(name);
            const count = usage === null ? 0 : (usage.refs.get(name)?.length ?? 0);
            const preview = previews.get(name);
            return (
              <button
                key={name}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                className="group flex cursor-pointer items-center justify-between gap-2 rounded-md border-0 bg-transparent px-2 py-1 text-left text-text hover:bg-chrome"
                onClick={() =>
                  controller.apply(styleNamesOp(path, toggleStyleName(view.styleNames, name, !on)))
                }
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span aria-hidden className="inline-flex w-3 shrink-0 text-accent">
                    {on ? <IconCheck size={12} /> : null}
                  </span>
                  {/* The name rendered in an approximation of its own style, on
                      the shared paper tint. Unset props inherit; a long name
                      truncates on its single line (gdoc-style) rather than
                      wrapping character-by-character. */}
                  <span
                    className={`${PREVIEW_CHIP} min-w-0 truncate px-1.5 py-0.5`}
                    style={preview === undefined ? undefined : stylePreview(preview)}
                  >
                    {name}
                  </span>
                </span>
                {count > 0 ? (
                  <span className="shrink-0 whitespace-nowrap text-sm text-muted">
                    {usageLabel(t, count)}
                  </span>
                ) : null}
              </button>
            );
          })}
          {canCapture ? (
            <>
              {options.length > 0 ? (
                <div aria-hidden className="my-1 border-t border-border" />
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="cursor-pointer rounded-md border-0 bg-transparent px-2 py-1 text-left text-text hover:bg-chrome"
                onClick={() => {
                  setOpen(false);
                  onSaveAs();
                }}
              >
                {t('styleCapture.fromSelection')}
              </button>
              {updateTarget !== null ? (
                <button
                  type="button"
                  role="menuitem"
                  className="cursor-pointer rounded-md border-0 bg-transparent px-2 py-1 text-left text-text hover:bg-chrome"
                  onClick={() => {
                    setOpen(false);
                    onUpdate(updateTarget);
                  }}
                >
                  {t('styleCapture.updateFrom', { name: updateTarget })}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
