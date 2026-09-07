// The content tab: it routes each content-bearing item type to its surface and
// owns the text/data pair the rest share (`text`/`qr_code`). The per-type
// surfaces live in `contentParts.tsx` (image, page number) and the iterable
// sections in `TableColumnsSection.tsx` / `IterableSourceSection.tsx`.

import type { Op } from '@shojiku/designer-core';
import { useRef } from 'react';
import { useI18n } from '../i18n/context';
import { INPUT } from '../ui/chrome';
import { CharGridMarkupField } from './CharGridMarkupField';
import { BoundContent } from './contentBound';
import { ImageContent, PageNumberContent } from './contentParts';
import { TextContentField } from './contentText';
import { Field } from './fields';
import { formatOptions } from './formatModel';
import { IterableSourceSection } from './IterableSourceSection';
import type { ItemPanelProps } from './itemPanelProps';
import { type ContentMode, MARK_TYPES, registryNames } from './itemView';
import { MarkSection } from './MarkSection';
import { applyPanelOp, switchContentOps, textAsBinding } from './model';
import { chipsFor, HelpfulHeading } from './panelHelpers';
import { SpansSection } from './SpansSection';
import { TableColumnsSection } from './TableColumnsSection';

export function ContentSection(props: ItemPanelProps) {
  const { t } = useI18n();
  // The mixed text a switch to data mode had to drop (`{customer.name} 様` is
  // not something any single `data:` can hold), offered back when the reader
  // switches this SAME item straight back. It waits here rather than in the
  // file because the document carries exactly one content key.
  const dropped = useRef<{ path: string; text: string } | null>(null);
  const { controller, path, view, capabilities } = props;
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  const chips = chipsFor(props);
  const bindingOptions = chips.options;

  if (view.type === 'table') {
    return (
      <TableColumnsSection
        controller={controller}
        tablePath={path}
        dataKey={view.dataKey}
        dataScope={view.dataScope}
        groups={props.paletteGroups}
        params={props.params}
        capabilities={capabilities}
        formatCatalog={props.formatCatalog}
        onOpenSheet={props.onOpenColumnSheet}
      />
    );
  }
  if (view.type === 'repeat_flow' || view.type === 'list') {
    return (
      <IterableSourceSection
        controller={controller}
        path={path}
        dataKey={view.dataKey}
        dataScope={view.dataScope}
        entryText={view.type === 'list' ? view.text : null}
        groups={props.paletteGroups}
        capabilities={capabilities}
      />
    );
  }
  if (view.type === 'image') {
    return <ImageContent {...props} chips={chips} />;
  }
  if (view.type === 'page_number') {
    return <PageNumberContent {...props} />;
  }
  if (MARK_TYPES.has(view.type)) {
    // A form mark's content is its PRESENCE, not a string: the `{key}` chips,
    // the format picker and the text/data switch have nothing to act on here,
    // so the section is its own rather than a mode of the pair below.
    return <MarkSection props={props} chips={chips} />;
  }
  if (view.type === 'text' && view.hasSpans) {
    // Inline rich text REPLACES the pair below: `spans` wins over `text`/`data`,
    // so the pair would be editing a key the engine ignores. Keyed by path so
    // the selected fragment resets when a different item is selected.
    return <SpansSection key={path} {...props} />;
  }
  // text / qr_code / char_grid: the content-mode pair.
  const formatRows = formatOptions(
    registryNames(controller.read('formats')),
    bindingOptions.find((option) => option.key === view.dataKey)?.type,
    capabilities,
    props.formatCatalog ?? null,
  );
  return (
    <section>
      <HelpfulHeading
        title={t('panel.section.content')}
        topic="content"
        onOpenGlossary={props.onOpenGlossary}
      />
      <Field label={t('panel.contentMode')}>
        <select
          className={INPUT}
          value={view.contentMode}
          onChange={(event) => {
            const target = event.currentTarget.value as ContentMode;
            if (target === 'data' && textAsBinding(view.text) === null) {
              dropped.current = view.text === '' ? null : { path, text: view.text };
            }
            const back = dropped.current?.path === path ? dropped.current.text : '';
            controller.applyAll(switchContentOps(path, view, target, back));
          }}
        >
          <option value="text">{t('panel.contentMode.text')}</option>
          <option value="data">{t('panel.contentMode.data')}</option>
        </select>
      </Field>
      {view.contentMode === 'text' ? (
        <TextContentField props={props} chips={chips} />
      ) : (
        <BoundContent
          props={props}
          chips={chips}
          bindingOptions={bindingOptions}
          formatRows={formatRows}
          dispatch={dispatch}
        />
      )}
      {/* char_grid only, and only against an engine that has the grammar. It
          interprets the CONTENT above, so it sits under it rather than with the
          grid geometry on the placement tab. */}
      <CharGridMarkupField {...props} />
    </section>
  );
}
