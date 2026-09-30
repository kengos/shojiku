// The body of a table's 「見出し行の書式」 / 「本文行の書式」 sections: the band's
// format controls (`TableBandFields`) over its cascade context, then its named
// styles behind the 「名前付きスタイル」 disclosure — the body band's with its even rows'
// (`row.alternateStyleNames`) beside it. Split from `TableStyleSection`, whose
// `TableStyleContext` it takes, so the move-to-a-sheet promise made there holds
// for these bodies too.

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import { AdvancedStyles, namesAt } from './AdvancedStyles';
import { headerFillOf, readBandCascades } from './bandCascade';
import { HiddenHeaderNote } from './HiddenHeaderField';
import { applyPanelOp } from './model';
import { bodyValignHost, headerValignHost, TableBandFields } from './TableBandFields';
import type { TableStyleContext } from './TableStyleSection';
import { readTableStyle, TABLE_HEADER_FILL } from './tableStyleModel';

/** The key paths the two bands own under the table item. */
const HEADER_KEYS = ['header', 'style'] as const;
const ROW_KEYS = ['row', 'style'] as const;

/** One band section's body: the header band (with the note that its fields
 * paint nothing while the row is hidden) or the body band, then the band's
 * named styles behind the 「名前付きスタイル」 disclosure — the body band's with its
 * even rows' list beside it. */
export function TableBandBody({
  context,
  band,
}: {
  readonly context: TableStyleContext;
  readonly band: 'header' | 'row';
}) {
  const { t } = useI18n();
  const { path, controller, floor, capabilities, fontFamilies } = context;
  const raw = controller.read(path);
  const bands = readBandCascades(controller.read, path, floor);
  const onOp = (op: Op | null) => applyPanelOp(controller, op);
  if (band === 'row') {
    return (
      <>
        <TableBandFields
          ctx={bands.row}
          path={path}
          keys={ROW_KEYS}
          host={{
            fontFamilies,
            verticalAlign: bodyValignHost(capabilities),
            fill: true,
          }}
          onOp={onOp}
        />
        <AdvancedStyles
          controller={controller}
          path={path}
          lists={[
            { keys: ['row', 'styleNames'], names: namesAt(raw, ['row', 'styleNames']) },
            {
              keys: ['row', 'alternateStyleNames'],
              names: namesAt(raw, ['row', 'alternateStyleNames']),
              label: t('panel.tableStyle.evenRowStyles'),
            },
          ]}
        />
      </>
    );
  }
  return (
    <>
      <HiddenHeaderNote hidden={readTableStyle(raw).hiddenHeader} />
      <TableBandFields
        ctx={bands.header}
        path={path}
        keys={HEADER_KEYS}
        host={{
          fontFamilies,
          verticalAlign: headerValignHost(capabilities),
          fill: true,
        }}
        headerFill={headerFillOf(bands.header, TABLE_HEADER_FILL)}
        onOp={onOp}
      />
      <AdvancedStyles
        controller={controller}
        path={path}
        lists={[{ keys: ['header', 'styleNames'], names: namesAt(raw, ['header', 'styleNames']) }]}
      />
    </>
  );
}
