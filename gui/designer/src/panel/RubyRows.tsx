// The entry list of the ruby section (`RubySection`): one row per authored
// `{ base, text }` — two inputs and a remove button — and, under them, the row
// that adds one (`RubyAddRow.tsx`). Every write goes through `rubyModel.ts`.
//
// An existing entry's inputs are UNCOMMITTED-until-blur like every panel field,
// and keyed by their value plus a reseed nonce (`useReseedKey`): a commit can
// be refused (empty, over the cap), and the refused text must not stay on
// screen over a document that never changed. Emptying a field is refused
// rather than read as "remove" — the row's own button removes it.

import type { KeyboardEvent } from 'react';
import { useI18n } from '../i18n/context';
import { IconButton } from '../ui/Button';
import { IconTrash } from '../ui/icons';
import { AddRow, ENTRY_INPUT } from './RubyAddRow';
import {
  editRubyOp,
  type RubyField,
  type RubyRow,
  type RubyRowsContext,
  removeRubyOp,
  rubyStringAccepted,
} from './rubyModel';
import { useReseedKey } from './useReseedKey';

function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
    event.currentTarget.blur();
  }
}

/** One side of one existing entry. Its own component so the reseed hook has a
 * fixed home (the rows are a variable-length map). */
function EntryInput({
  ctx,
  row,
  field,
  label,
}: {
  readonly ctx: RubyRowsContext;
  readonly row: RubyRow;
  readonly field: RubyField;
  readonly label: string;
}) {
  const current = row[field];
  const [inputKey, reseed] = useReseedKey(current);
  return (
    <input
      key={inputKey}
      type="text"
      aria-label={label}
      className={ENTRY_INPUT}
      defaultValue={current}
      onKeyDown={blurOnEnter}
      onBlur={(event) => {
        const next = event.currentTarget.value;
        if (next === current) {
          return;
        }
        ctx.onTooLong(next !== '' && !rubyStringAccepted(next));
        ctx.dispatch(editRubyOp(ctx.path, row, field, next));
        reseed();
      }}
    />
  );
}

function EntryRow({ ctx, row }: { readonly ctx: RubyRowsContext; readonly row: RubyRow }) {
  const { t } = useI18n();
  const n = row.index + 1;
  return (
    <div className="mb-1 flex min-w-0 items-center gap-1">
      {row.readable ? (
        <>
          <EntryInput ctx={ctx} row={row} field="base" label={t('panel.ruby.baseOf', { n })} />
          <EntryInput ctx={ctx} row={row} field="text" label={t('panel.ruby.readingOf', { n })} />
        </>
      ) : (
        <span className="min-w-0 flex-1 px-2 text-sm text-muted italic">
          {t('panel.ruby.unreadableEntry')}
        </span>
      )}
      <IconButton
        label={t('panel.ruby.remove', { n })}
        variant="ghost"
        onClick={() => ctx.dispatch(removeRubyOp(ctx.path, ctx.view, row.index))}
      >
        <IconTrash />
      </IconButton>
    </div>
  );
}

/** The entries and the add row. Not rendered over an unreadable list — the
 * section offers to clear that instead. */
export function RubyRows({ ctx }: { readonly ctx: RubyRowsContext }) {
  return (
    <div>
      {ctx.view.rows.map((row) => (
        <EntryRow key={row.index} ctx={ctx} row={row} />
      ))}
      <AddRow ctx={ctx} />
    </div>
  );
}
