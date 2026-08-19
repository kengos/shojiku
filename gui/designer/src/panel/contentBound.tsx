// The DATA half of the content-mode pair: which field this item is bound to,
// and the two options that ride a binding — the display format and the
// placeholder shown when the value is missing.
//
// Split out of `ContentSection.tsx`, which sits at the executable-line cap.
//
// Both options live on the BINDING — `formatOp`/`placeholderOp` write
// `data.format`/`data.placeholder`, not item-root keys — so every data-bound
// type takes them, `char_grid` included: its `data:` is the same `Binding`,
// and `resolve_content` passes both straight through. (`CharGridItem` being
// `deny_unknown_fields` says nothing about this; it governs the item root,
// which is not where these are written.)

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import type { ChipContext } from '../text/chipContext';
import { FieldPicker } from './FieldPicker';
import { FormatPicker } from './FormatPicker';
import { TextField } from './fields';
import type { FormatOption } from './formatModel';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import { bindingKeyOp, formatOp, placeholderOp } from './model';
import { documentScopeCreateField, scopePickerProps } from './panelHelpers';
import type { PickerOption } from './pickerModel';

export function BoundContent({
  props,
  chips,
  bindingOptions,
  formatRows,
  dispatch,
}: {
  readonly props: ItemPanelProps;
  readonly chips: ChipContext;
  readonly bindingOptions: readonly PickerOption[];
  readonly formatRows: readonly FormatOption[];
  readonly dispatch: (op: Op | null) => void;
}) {
  const { t } = useI18n();
  // `view` is read off the bundle rather than passed beside it — it IS
  // `props.view`, and taking both invites the two to drift.
  const { path, capabilities, view } = props;
  return (
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
  );
}
