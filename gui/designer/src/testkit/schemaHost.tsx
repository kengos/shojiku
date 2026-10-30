// The two hosts a catalog-driven field section serves, as test mounts over a
// real editor (test substrate only — excluded from coverage). The LIVE host
// turns each `FieldEdit` into one op at once; the DRAFT host keeps edits in
// local state and writes the changed keys as one batch on 保存, the way the
// named-style form commits. Both edit the named style `styles.s`, and both
// render the document text, so a suite asserts bytes, not a spy.

import type { CatalogField } from '@shojiku/designer-core';
import { type ReactNode, useState } from 'react';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { record } from '../panel/itemView';
import {
  type FieldEdit,
  type FieldValues,
  fieldEditOp,
  sameValue,
} from '../panel/schema/fieldEdit';
import { SchemaFields } from '../panel/schema/SchemaFields';
import type { SchemaContext } from '../panel/schema/widgetTypes';

/** Where both hosts edit. */
export const STYLE_BASE = ['styles', 's'];

export interface SchemaHostProps {
  readonly source: string;
  readonly fields: readonly CatalogField[];
  readonly context?: SchemaContext;
  /** Every edit the section reported, in order. */
  readonly edits?: FieldEdit[];
  /** The section to mount; `SchemaFields` unless a suite wraps it. */
  readonly section?: (props: {
    readonly fields: readonly CatalogField[];
    readonly values: FieldValues;
    readonly context: SchemaContext;
    readonly onEdit: (edit: FieldEdit) => void;
  }) => ReactNode;
}

const BLANK: SchemaContext = { unset: 'blank' };

function own(value: unknown): FieldValues {
  return record(value) ?? {};
}

export function LiveHost({
  source,
  fields,
  context = BLANK,
  edits = [],
  section: Section = SchemaFields,
}: SchemaHostProps) {
  const editor = useEditor(source);
  const values = own(own(editor.read('styles')).s);
  return (
    <I18nProvider locale="en">
      <Section
        fields={fields}
        values={values}
        context={context}
        onEdit={(edit) => {
          edits.push(edit);
          editor.apply(fieldEditOp(undefined, STYLE_BASE, edit));
        }}
      />
      <button type="button" onClick={editor.undo}>
        undo
      </button>
      <pre data-testid="doc">{editor.text}</pre>
    </I18nProvider>
  );
}

export function DraftHost({ source, fields, context = BLANK, edits = [] }: SchemaHostProps) {
  const editor = useEditor(source);
  const saved = own(own(editor.read('styles')).s);
  const [draft, setDraft] = useState<FieldValues>(saved);
  const save = () => {
    const changed = Object.keys({ ...saved, ...draft }).filter(
      (key) => !sameValue(saved[key], draft[key] as FieldEdit['value']),
    );
    editor.applyAll(
      changed.map((key) =>
        fieldEditOp(undefined, STYLE_BASE, {
          keys: [key],
          value: draft[key] as FieldEdit['value'],
        }),
      ),
    );
  };
  return (
    <I18nProvider locale="en">
      <SchemaFields
        fields={fields}
        values={draft}
        context={context}
        onEdit={(edit) => {
          edits.push(edit);
          const next: Record<string, unknown> = { ...draft };
          if (edit.value === undefined) {
            delete next[edit.keys[0]];
          } else {
            next[edit.keys[0]] = edit.value;
          }
          setDraft(next);
        }}
      />
      <button type="button" onClick={save}>
        save
      </button>
      <button type="button" onClick={editor.undo}>
        undo
      </button>
      <pre data-testid="doc">{editor.text}</pre>
    </I18nProvider>
  );
}
