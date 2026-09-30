// The table's 「文字」 section: the text settings the table's OWN `style` hands
// every cell — font family, size, bold, italic, colour, alignment and, where the
// engine declares it, vertical alignment — over the table's cascade context. The
// same controls every band carries (`TableBandFields`), minus the background: a
// table fill is never painted. The format toolbar writes the same keys (all but
// the vertical alignment) when a table is selected.
//
// Gated on `table.style`, like the band sections below it.

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import { cascadeContext } from '../toolbar/cascade';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import { applyPanelOp } from './model';
import { PanelSection } from './PanelSection';
import { bodyValignHost, TableBandFields } from './TableBandFields';
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
  const valign = bodyValignHost(capabilities);
  return (
    <PanelSection
      id="table.text"
      title={i18n.t('panel.tableSection.text.title')}
      summary={textSummary(i18n, readBand(controller.read(path)), valign !== false)}
      // The section it points at is named by ITS title key, not retyped.
      help={i18n.t('panel.tableSection.text.help', {
        conditions: i18n.t('panel.tableSection.conditions.title'),
      })}
    >
      <TableBandFields
        ctx={cascadeContext(controller.read, path, floor)}
        path={path}
        keys={TABLE_STYLE_KEYS}
        host={{ fontFamilies, verticalAlign: valign, fill: false }}
        onOp={(op: Op | null) => applyPanelOp(controller, op)}
      />
    </PanelSection>
  );
}
