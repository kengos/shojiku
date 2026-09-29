// A header group's 「書式」 part, below its label and span on `GroupForm`: the
// same format controls every table band carries (`TableBandFields`) at the
// group's own `style.*`, then its named styles behind the 「名前付きスタイル」 disclosure.
//
// The cascade is the engine's (`engine/layout/src/engine/table/span.rs`): a
// group resolves over the TABLE's inherited style — not the header band's — and
// its fill and border are its OWN, painted over the group row's band. That
// band is NOT the header band: it resolves from an empty style, so beneath an
// unset group fill the page always carries the engine's `#ededed`, whatever
// `header.style.backgroundColor` says — which is what the fill control shows.
//
// Gated on `table.headerGroups.style.fill`, the capability under which an engine
// paints a group's own style. Vertical alignment is honoured on a group.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { cascadeContext } from '../toolbar/cascade';
import { SECTION_TITLE } from '../ui/chrome';
import { AdvancedStyles, namesAt } from './AdvancedStyles';
import { bandContext, headerFillOf } from './bandCascade';
import { hasCapability } from './itemPanelProps';
import { applyPanelOp } from './model';
import { TABLE_VALIGN_CAPABILITY, TableBandFields } from './TableBandFields';
import { TABLE_HEADER_FILL } from './tableStyleModel';

/** The capability under which an engine paints a group's own style. */
export const GROUP_STYLE_CAPABILITY = 'table.headerGroups.style.fill';

/** A group's own style sits at `style.*` under the group entry. */
const GROUP_STYLE_KEYS = ['style'] as const;

export interface GroupStyleContext {
  readonly controller: EditorController;
  /** The group's structural path (`…headerGroups[n]`). */
  readonly path: string;
  readonly tablePath: string;
  readonly fontFamilies: readonly string[];
  readonly capabilities?: readonly string[];
  readonly floor?: Readonly<Record<string, unknown>>;
}

export function GroupStyleFields({ context }: { readonly context: GroupStyleContext }) {
  const { t } = useI18n();
  const { controller, path, tablePath, capabilities } = context;
  if (!hasCapability(capabilities, GROUP_STYLE_CAPABILITY)) {
    return null;
  }
  const tableCtx = cascadeContext(controller.read, tablePath, context.floor);
  const group = controller.read(path);
  const ctx = bandContext(tableCtx, group);
  return (
    <section className="mt-4">
      <h3 className={SECTION_TITLE}>{t('panel.headerGroup.format')}</h3>
      <TableBandFields
        ctx={ctx}
        path={path}
        keys={GROUP_STYLE_KEYS}
        host={{
          fontFamilies: context.fontFamilies,
          verticalAlign: hasCapability(capabilities, TABLE_VALIGN_CAPABILITY),
          fill: true,
        }}
        headerFill={headerFillOf(ctx, TABLE_HEADER_FILL)}
        onOp={(op: Op | null) => applyPanelOp(controller, op)}
      />
      <AdvancedStyles
        controller={controller}
        path={path}
        lists={[{ keys: ['styleNames'], names: namesAt(group, ['styleNames']) }]}
      />
    </section>
  );
}
