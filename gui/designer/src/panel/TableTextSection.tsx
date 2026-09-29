// The table's 「文字」 section: the text settings the table's OWN `style` hands
// every cell — font family, size, bold, italic, colour, alignment — over the
// table's cascade context. The same controls every band carries
// (`TableBandFields`), minus the two the engine does not honour on a table's own
// style: the background (a table fill is never painted) and the vertical
// alignment (a body cell takes its column's alone). The format toolbar writes
// the same keys when a table is selected.
//
// Gated on `table.style`, like the band sections below it.

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import { cascadeContext } from '../toolbar/cascade';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import { applyPanelOp } from './model';
import { PanelSection } from './PanelSection';
import { TableBandFields } from './TableBandFields';
import { textSummary } from './tableDecorationSummaries';
import { readBand } from './tableStyleModel';

/** The table's own style sits at `style.*` under the table item. */
const TABLE_STYLE_KEYS = ['style'] as const;

export function TableTextSection(props: ItemPanelProps) {
  const i18n = useI18n();
  const { controller, path, capabilities, floor, fontFamilies } = props;
  if (!hasCapability(capabilities, 'table.style')) {
    return null;
  }
  return (
    <PanelSection
      id="table.text"
      title={i18n.t('panel.tableSection.text.title')}
      summary={textSummary(i18n, readBand(controller.read(path)))}
      // The section it points at is named by ITS title key, not retyped.
      help={i18n.t('panel.tableSection.text.help', {
        conditions: i18n.t('panel.tableSection.conditions.title'),
      })}
    >
      <TableBandFields
        ctx={cascadeContext(controller.read, path, floor)}
        path={path}
        keys={TABLE_STYLE_KEYS}
        host={{ fontFamilies, verticalAlign: false, fill: false }}
        onOp={(op: Op | null) => applyPanelOp(controller, op)}
      />
    </PanelSection>
  );
}
