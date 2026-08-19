// The content tab: it routes each content-bearing item type to its surface and
// owns the text/data pair the rest share (`text`/`qr_code`). The per-type
// surfaces live in `contentParts.tsx` (image, page number) and the iterable
// sections in `TableColumnsSection.tsx` / `IterableSourceSection.tsx`.

import type { Op } from '@shojiku/designer-core';
import { useRef } from 'react';
import { useI18n } from '../i18n/context';
import { commitOps } from '../text/declCommit';
import { TextEditor } from '../text/TextEditor';
import { INPUT } from '../ui/chrome';
import { CHAR_GRID_TYPE } from './charGrid';
import { BoundContent } from './contentBound';
import { ImageContent, PageNumberContent } from './contentParts';
import { Field, FieldGroup } from './fields';
import { formatOptions } from './formatModel';
import { IterableSourceSection } from './IterableSourceSection';
import type { ItemPanelProps } from './itemPanelProps';
import { type ContentMode, registryNames } from './itemView';
import { applyPanelOp, switchContentOps, textAsBinding } from './model';
import { chipsFor, HelpfulHeading } from './panelHelpers';
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
  // `CharGridItem` is `deny_unknown_fields` and carries NEITHER `format` NOR
  // `placeholder`, so offering either would author wire the engine refuses —
  // the content pair is all a char_grid can take here.
  const wireTakesBindingOptions = view.type !== CHAR_GRID_TYPE;
  // text / qr_code / char_grid: the content-mode pair.
  const formatRows = formatOptions(
    registryNames(controller.read('formats')),
    bindingOptions.find((option) => option.key === view.dataKey)?.type,
    capabilities,
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
        // FieldGroup, not Field: the editor is a contenteditable next to the
        // insert-a-field button, and a `<label>` around that pair sends every
        // click inside it to the button.
        <FieldGroup label={t('panel.field.text')}>
          <TextEditor
            // Keyed by value: the contenteditable seeds once per mount, so it
            // reseeds on an EXTERNAL change (undo, a delete shifting a sibling
            // into this slot) but not on a sibling field's commit — the property
            // panel no longer remounts wholesale per revision.
            key={view.text}
            value={view.text}
            className={`sj-text-editor min-h-[2.4em] ${INPUT}`}
            ariaLabel={t('panel.field.text')}
            chips={chips}
            onCommit={(v, declarations) =>
              controller.applyAll(
                commitOps({
                  read: controller.read,
                  path,
                  oldText: view.text,
                  newText: v,
                  pending: declarations,
                }),
              )
            }
          />
        </FieldGroup>
      ) : (
        <BoundContent
          props={props}
          chips={chips}
          bindingOptions={bindingOptions}
          formatRows={formatRows}
          wireTakesBindingOptions={wireTakesBindingOptions}
          dispatch={dispatch}
        />
      )}
    </section>
  );
}
