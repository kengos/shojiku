// The content tab: it routes each content-bearing item type to its surface and
// owns the text/data pair the rest share (`text`/`qr_code`). The per-type
// surfaces live in `contentParts.tsx` (image, page number) and the iterable
// sections in `TableColumnsSection.tsx` / `IterableSourceSection.tsx`.

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import { commitOps } from '../text/declCommit';
import { TextEditor } from '../text/TextEditor';
import { INPUT } from '../ui/chrome';
import { ImageContent, PageNumberContent } from './contentParts';
import { FieldPicker } from './FieldPicker';
import { FormatPicker } from './FormatPicker';
import { Field, FieldGroup, TextField } from './fields';
import { formatOptions } from './formatModel';
import { IterableSourceSection } from './IterableSourceSection';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import { type ContentMode, registryNames } from './itemView';
import { applyPanelOp, bindingKeyOp, formatOp, placeholderOp, switchContentOps } from './model';
import {
  chipsFor,
  documentScopeCreateField,
  HelpfulHeading,
  scopePickerProps,
} from './panelHelpers';
import { TableColumnsSection } from './TableColumnsSection';

export function ContentSection(props: ItemPanelProps) {
  const { t } = useI18n();
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
  // text / qr_code: the content-mode pair.
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
          onChange={(event) =>
            controller.applyAll(
              switchContentOps(path, view, event.currentTarget.value as ContentMode),
            )
          }
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
        <>
          <FieldPicker
            label={t('panel.field.dataKey')}
            value={view.dataKey}
            options={bindingOptions}
            onCommit={(v) => dispatch(bindingKeyOp(path, v))}
            onCreateField={documentScopeCreateField(props)}
            {...scopePickerProps(props, chips)}
          />
          {/* The format field appears only once a data key is picked:
              a format on an unbound key is inert noise. */}
          {view.dataKey !== '' ? (
            <FormatPicker
              label={t('panel.field.format')}
              value={view.format}
              options={formatRows}
              onCommit={(v) => dispatch(formatOp(path, v))}
            />
          ) : null}
          {hasCapability(capabilities, 'binding.placeholder') ? (
            <TextField
              label={t('panel.field.placeholder')}
              value={view.placeholder}
              onCommit={(v) => dispatch(placeholderOp(path, v))}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
