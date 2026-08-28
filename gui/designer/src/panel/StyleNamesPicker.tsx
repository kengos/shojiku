// The named-style multi-select, as ONE leaf rather than a block inlined in the
// section that happens to need it.
//
// It was inline in `StyleSection` (the decoration tab), which is the only place a
// styled item could reach it. A `char_grid` has no decoration tab — the border
// cluster would author the grid RULING under the `border` spelling — so the one
// control that decides which named styles apply to it was unreachable from the
// panel, while the engine honours `styleNames` on it through two paths. Lifting the
// block here is what lets a second tab mount it without a second copy.
//
// The read is deliberately the item's OWN `styleNames` and nothing else: the engine's
// `authored()` consults the named styles and the item's own style and stops there, so
// there is no cascade to badge and no effective value to show. The option list is the
// registry's names UNION the ones this item already carries, so a name that has since
// been deleted from the registry still renders checked and can be unticked — hiding
// it would leave an authored value the panel could neither show nor remove.

import type { ReactNode } from 'react';
import { useI18n } from '../i18n/context';
import { CheckboxList } from './choiceFields';
import type { ItemPanelProps } from './itemPanelProps';
import { registryNames } from './itemView';
import { applyPanelOp, styleNamesOp, toggleStyleName } from './model';

export function StyleNamesPicker({
  controller,
  path,
  styleNames,
  help,
}: {
  readonly controller: ItemPanelProps['controller'];
  readonly path: string;
  /** The item's authored `styleNames`, in order. */
  readonly styleNames: readonly string[];
  /** An optional `?` beside the legend. */
  readonly help?: ReactNode;
}) {
  const { t } = useI18n();
  const options = Array.from(new Set([...registryNames(controller.read('styles')), ...styleNames]));
  return (
    <CheckboxList
      label={t('panel.field.styleNames')}
      help={help}
      options={options}
      selected={styleNames}
      emptyLabel={t('panel.field.formatNone')}
      onToggle={(name, on) =>
        applyPanelOp(controller, styleNamesOp(path, toggleStyleName(styleNames, name, on)))
      }
    />
  );
}
