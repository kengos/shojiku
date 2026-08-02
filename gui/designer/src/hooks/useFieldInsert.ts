// The create-data-field modal: a fresh top-level scalar field, riding
// extendParams (the ONE fresh-key authority). Two entry points, so the confirm
// handler needs the post-create action: the insert-menu opener leaves the bind
// ref null (→ insert a NEW bound item), a data.key picker tail stores its own
// commit (→ bind the CURRENT item, no new insert). Field creation is workshop mode
// only (a fresh key under an engineer schema would be validate noise).

import { useRef, useState } from 'react';
import { type FieldChoice, type FieldRefusal, fieldSchema } from '../insert/fieldModel';
import { resolveInsertTarget } from '../insert/model';
import { boundSnippet } from '../palette/dragSnippet';
import { extendParams } from '../sample/generate';
import { updateActive } from '../sample/variants';
import type { InsertContext } from './insertContext';

export interface FieldInsert {
  readonly fieldOpen: boolean;
  readonly setFieldOpen: (open: boolean) => void;
  readonly openFieldInsert: () => void;
  readonly handleFieldConfirm: (choice: FieldChoice) => FieldRefusal | null;
  /** The picker tail is armed only in workshop mode (the ItemPanel further gates it
   * to document scope — a fresh top-level key cannot bind a row-scoped picker). */
  readonly onCreateField: ((bindKey: (key: string) => void) => void) | undefined;
}

export function useFieldInsert(ctx: InsertContext, workshop: boolean): FieldInsert {
  const { read, selection, apply, select, params, sampleSet, commitSet, synth, locale } = ctx;
  const [fieldOpen, setFieldOpen] = useState(false);
  const fieldBindRef = useRef<((key: string) => void) | null>(null);

  const openFieldInsert = () => {
    fieldBindRef.current = null;
    setFieldOpen(true);
  };
  const openFieldBind = (bindKey: (key: string) => void) => {
    fieldBindRef.current = bindKey;
    setFieldOpen(true);
  };

  const handleFieldConfirm = (choice: FieldChoice): FieldRefusal | null => {
    // Generate the field's sample value FIRST (pure); commit it only after the
    // insert/bind succeeds so a refused op never leaves an orphan params key.
    const ext = extendParams(
      params,
      choice.name,
      fieldSchema(choice.kind, choice.sample),
      synth,
      locale,
    );
    if (!ext.ok) {
      return ext.reason;
    }
    const bind = fieldBindRef.current;
    if (bind === null) {
      // The kinds never yield an image field, so boundSnippet gives a
      // flow-auto-sized text item bound via data.key; the dialog is
      // workshop mode-only, so a currency field carries `format: symbol`.
      const target = resolveInsertTarget(read, selection);
      const result = apply({
        op: 'insertItem',
        path: target.path,
        index: target.index,
        value: boundSnippet(
          {
            key: choice.name,
            type: choice.kind === 'currency' ? 'currency' : 'string',
            label: choice.name,
            // The dialog mints a fresh TOP-LEVEL params key, so the field is
            // document-scope by construction — never a row's.
            group: null,
          },
          true,
        ),
      });
      if (!result.ok) {
        return 'insert_failed';
      }
      commitSet(updateActive(sampleSet, ext.text));
      select(`${target.path}[${target.index}]`);
    } else {
      commitSet(updateActive(sampleSet, ext.text));
      bind(choice.name);
    }
    setFieldOpen(false);
    return null;
  };

  return {
    fieldOpen,
    setFieldOpen,
    openFieldInsert,
    handleFieldConfirm,
    onCreateField: workshop ? openFieldBind : undefined,
  };
}
