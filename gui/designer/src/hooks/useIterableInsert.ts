// The iterable-scaffold dialog: array data (a definitions group, or a
// blank-start spec typed inline) becomes ONE insertItem scaffold — plus,
// blank-start, the extendParams sample rows the preview shows immediately.

import { useState } from 'react';
import type { IterableChoice, IterableRefusal } from '../insert/iterableModel';
import { resolveIterableTarget } from '../insert/iterableTarget';
import { type ScaffoldSpec, scaffoldFromGroup } from '../insert/scaffold';
import { scaffoldFromFields, scaffoldSchema } from '../insert/scaffoldFields';
import { scaffoldSnippet } from '../insert/scaffoldSnippet';
import { extendParams } from '../sample/generate';
import { updateActive } from '../sample/variants';
import type { InsertContext } from './insertContext';

export interface IterableInsert {
  readonly iterableOpen: boolean;
  readonly setIterableOpen: (open: boolean) => void;
  readonly handleIterableConfirm: (choice: IterableChoice) => IterableRefusal | null;
}

export function useIterableInsert(ctx: InsertContext): IterableInsert {
  const { read, selection, apply, select, params, sampleSet, commitSet, synth, locale } = ctx;
  const [iterableOpen, setIterableOpen] = useState(false);

  const handleIterableConfirm = (choice: IterableChoice): IterableRefusal | null => {
    let spec: ScaffoldSpec;
    let extended: string | null = null;
    if (choice.kind === 'group') {
      spec = scaffoldFromGroup(choice.group);
    } else {
      spec = scaffoldFromFields(choice.name, choice.fields, choice.variant);
      // Generate the sample rows FIRST (pure), but commit them only after the
      // insert succeeds — a refused op must not leave orphan params behind.
      const ext = extendParams(
        params,
        choice.name,
        scaffoldSchema(choice.fields, choice.variant),
        synth,
        locale,
      );
      if (!ext.ok) {
        return ext.reason;
      }
      extended = ext.text;
    }
    const target = resolveIterableTarget(read, selection);
    const result = apply({
      op: 'insertItem',
      path: target.path,
      index: target.index,
      value: scaffoldSnippet(spec, choice.variant, ctx.canDeclare),
    });
    if (!result.ok) {
      return 'insert_failed';
    }
    if (extended !== null) {
      commitSet(updateActive(sampleSet, extended));
    }
    select(`${target.path}[${target.index}]`);
    setIterableOpen(false);
    return null;
  };

  return { iterableOpen, setIterableOpen, handleIterableConfirm };
}
