// The DATA half of the content-mode pair: which field a binding reads, and the
// two options that ride a binding — the display format and the placeholder
// shown when the value is missing.
//
// Split out of `ContentSection.tsx`, which sits at the executable-line cap.
//
// Both options live on the BINDING — `formatOp`/`placeholderOp` write
// `data.format`/`data.placeholder`, not item-root keys — so every data-bound
// type takes them, `char_grid` included: its `data:` is the same `Binding`,
// and `resolve_content` passes both straight through. (`CharGridItem` being
// `deny_unknown_fields` says nothing about this; it governs the item root,
// which is not where these are written.)
//
// The binding is addressed through a TARGET rather than read off the item,
// because an item is not the only node that carries one: a rich-text fragment
// (`<item>.spans[i]`) holds the same `Binding`, resolved by the same
// `resolve_content` against the same row scope, so its inspector mounts this
// component with its own path, values and per-fragment labels.

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import type { ChipContext } from '../text/chipContext';
import { FieldPicker } from './FieldPicker';
import { FormatPicker } from './FormatPicker';
import { TextField } from './fields';
import { type FormatOption, formatOptions } from './formatModel';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import { registryNames } from './itemView';
import { bindingKeyOp, formatOp, placeholderOp } from './model';
import { type BindingTarget, documentScopeCreateField, scopePickerProps } from './panelHelpers';
import type { PickerOption } from './pickerModel';

/** The format rows for a binding to `key` — the bound field's declared display
 * formats first, then the registry and the catalog. ONE builder for every
 * binding the panel edits, so an item and a fragment bound to the same field
 * are offered the same list. */
export function boundFormatRows(
  props: ItemPanelProps,
  bindingOptions: readonly PickerOption[],
  key: string,
): readonly FormatOption[] {
  const bound = bindingOptions.find((option) => option.key === key);
  return formatOptions(
    registryNames(props.controller.read('formats')),
    bound?.type,
    props.capabilities,
    props.formatCatalog ?? null,
    bound?.displayFormats,
  );
}

export function BoundContent({
  props,
  chips,
  target,
  label,
  bindingOptions,
  dispatch,
}: {
  readonly props: ItemPanelProps;
  readonly chips: ChipContext;
  /** The node that carries `data:` and what it holds now. */
  readonly target: BindingTarget;
  /** The accessible name of each field, from its plain name — identity for
   * the item, scoped to the fragment for a span (two controls answering to
   * one name would be a by-name query with two matches). */
  readonly label: (field: string) => string;
  readonly bindingOptions: readonly PickerOption[];
  readonly dispatch: (op: Op | null) => void;
}) {
  const { t } = useI18n();
  const { path } = target;
  return (
    <>
      <FieldPicker
        label={label(t('panel.field.dataKey'))}
        value={target.dataKey}
        options={bindingOptions}
        onCommit={(v) => dispatch(bindingKeyOp(path, v))}
        onCreateField={documentScopeCreateField(props)}
        {...scopePickerProps(props, chips, target)}
      />
      {/* The format field appears only once a data key is picked:
          a format on an unbound key is inert noise. */}
      {target.dataKey !== '' ? (
        <FormatPicker
          label={label(t('panel.field.format'))}
          value={target.format}
          options={boundFormatRows(props, bindingOptions, target.dataKey)}
          onCommit={(v) => dispatch(formatOp(path, v))}
        />
      ) : null}
      {hasCapability(props.capabilities, 'binding.placeholder') ? (
        <TextField
          label={label(t('panel.field.placeholder'))}
          value={target.placeholder}
          // `TextField` commits on every blur and leaves the changed-guard to
          // its caller. Without one, a blur at the field's own value wrote the
          // same placeholder again — an undo step for an edit nobody made.
          onCommit={(v) => dispatch(v === target.placeholder ? null : placeholderOp(path, v))}
        />
      ) : null}
    </>
  );
}
