// The decoration tab. A TABLE is routed to `TableDecorationSections` (its bands,
// grid and rules); every other type to `ItemDecorationSections` — the text, the
// overflow, fill and border (or the item's own stroke editor), opacity and the
// named styles, each a collapsible section offered only where the engine
// honours it. The tab's heading and its `?` on the cascade sit above both.

import { useI18n } from '../i18n/context';
import { ItemDecorationSections } from './ItemDecorationSections';
import type { ItemPanelProps } from './itemPanelProps';
import { HelpfulHeading } from './panelHelpers';
import { TableDecorationSections } from './TableDecorationSections';

export function StyleSection(props: ItemPanelProps) {
  const { t } = useI18n();
  if (props.view.type === 'table') {
    return <TableDecorationSections {...props} />;
  }
  return (
    <section>
      <HelpfulHeading
        title={t('panel.section.style')}
        topic="style"
        onOpenGlossary={props.onOpenGlossary}
      />
      <ItemDecorationSections {...props} />
    </section>
  );
}
