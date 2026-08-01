// The data-source section for the non-table iterables (`repeat_flow` / `list`):
// what a scaffold creates must stay editable — rebind the array, and for a
// `list` also edit its per-entry text template.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import type { PaletteGroup } from '../palette/model';
import { INPUT, SECTION_TITLE } from '../ui/chrome';
import { FieldPicker } from './FieldPicker';
import { Field } from './fields';
import { bindingKeyOp, plainTextOp } from './model';
import { sourceOptions, sourceScopeProps } from './sourceScope';

export interface IterableSourceSectionProps {
  readonly controller: EditorController;
  /** The selected `repeat_flow` / `list` item's structural path. */
  readonly path: string;
  /** The item's own `data.key` ('' when unset). */
  readonly dataKey: string;
  /** The item's own `data.scope` ('' when unset) — badges the picker when the
   * iterable is itself nested in a row scope. */
  readonly dataScope: string;
  /** A `list`'s per-entry text template ('' = entries print directly);
   * `null` hides the field (repeat_flow has no entry template). */
  readonly entryText: string | null;
  readonly groups: readonly PaletteGroup[] | null;
  /** The engine capability keys — gates the binding-scope escape a nested
   * iterable needs to reach a top-level array (undefined = show). */
  readonly capabilities?: readonly string[];
}

/** The data-source section for the non-table iterables: what a scaffold
 * creates must stay editable (rebind the array; a list also edits its
 * per-entry template — raw `{key}` text is the same expert path the text
 * item's content field already ships; clearing it prints entries directly). */
export function IterableSourceSection({
  controller,
  path,
  dataKey,
  dataScope,
  entryText,
  groups,
  capabilities,
}: IterableSourceSectionProps) {
  const { t } = useI18n();
  const dispatch = (op: Op) => {
    controller.apply(op);
  };
  return (
    <section className="mb-4">
      <h3 className={SECTION_TITLE}>{t('panel.section.listData')}</h3>
      <FieldPicker
        label={t('panel.field.dataKey')}
        value={dataKey}
        onCommit={(v) => dispatch(bindingKeyOp(path, v))}
        {...sourceScopeProps(controller, path, sourceOptions(groups), dataScope, capabilities)}
      />
      {entryText === null ? null : (
        <Field label={t('panel.field.entryText')}>
          <input
            type="text"
            className={INPUT}
            defaultValue={entryText}
            onBlur={(event) => {
              if (event.currentTarget.value !== entryText) {
                dispatch(plainTextOp(path, ['text'], event.currentTarget.value));
              }
            }}
          />
        </Field>
      )}
    </section>
  );
}
