// The DATA half of the content-mode pair: which field this item is bound to,
// and the two options that ride a binding — the display format and the
// placeholder shown when the value is missing.
//
// Split out of `ContentSection.tsx` (which sits at the executable-line cap) and
// kept as its own leaf because the two options are NOT universal: a `char_grid`
// binds a value like a text item does, but `CharGridItem` is
// `deny_unknown_fields` and carries neither `format` nor `placeholder`, so
// offering them there would author wire the engine refuses.

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
  wireTakesBindingOptions,
  dispatch,
}: {
  readonly props: ItemPanelProps;
  readonly chips: ChipContext;
  readonly bindingOptions: readonly PickerOption[];
  readonly formatRows: readonly FormatOption[];
  /** Whether this item type takes `format`/`placeholder` at all. */
  readonly wireTakesBindingOptions: boolean;
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
      {view.dataKey !== '' && wireTakesBindingOptions ? (
        <FormatPicker
          label={t('panel.field.format')}
          value={view.format}
          options={formatRows}
          onCommit={(v) => dispatch(formatOp(path, v))}
        />
      ) : null}
      {wireTakesBindingOptions && hasCapability(capabilities, 'binding.placeholder') ? (
        <TextField
          label={t('panel.field.placeholder')}
          value={view.placeholder}
          onCommit={(v) => dispatch(placeholderOp(path, v))}
        />
      ) : null}
    </>
  );
}
