// The node's NAME — its `id:` — for every item type, a table column, and the
// sub-template frames. It is what an anchor names ("circle THIS"), what the
// inspect box index offers a host as a lookup alias, and what a host's asset
// policy keys a dynamic image by. The engine reads it on every type and has no
// capability key for it, so the field is never gated.
//
// What an entry MEANS is `ids/idEdit`'s answer over the whole document's
// namespace (`ids/idIndex`): a name another node already carries is refused,
// naming that node; a rename carries every anchor that named the old id in the
// same undo step (the field says how many BEFORE the edit); clearing an id that
// anchors still name asks first, in a dialog, because those anchors stop
// drawing. A refused or normalised entry reseeds the field from the document.

import type { Op } from '@shojiku/designer-core';
import { useId, useMemo, useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import { HelpHint } from '../help/HelpHint';
import { useI18n } from '../i18n/context';
import { followers, type IdEdit, idEdit, MAX_ID_CHARS } from '../ids/idEdit';
import { buildIdIndex } from '../ids/idIndex';
import { kindName } from '../tree/labels';
import { FIELD_LABEL, INPUT } from '../ui/chrome';
import { IdClearConfirm } from './IdClearConfirm';

export interface ItemIdFieldProps {
  readonly controller: EditorController;
  /** The structural path of the node being named. */
  readonly path: string;
}

type I18nT = ReturnType<typeof useI18n>['t'];

function refusalText(edit: Extract<IdEdit, { ok: false }>, t: I18nT): string {
  if (edit.reason === 'duplicate') {
    const { label, kind } = edit.holder;
    return t('panel.id.duplicate', { label: label ?? kindName(kind, t) });
  }
  return t(`panel.id.refusal.${edit.reason}`, { max: MAX_ID_CHARS });
}

/** What a non-string authored id shows as: a scalar as written, a collection
 * as nothing (it is the note below that says what is wrong). */
function foreignText(raw: unknown): string {
  return typeof raw === 'number' || typeof raw === 'boolean' ? String(raw) : '';
}

function readId(controller: EditorController, path: string): unknown {
  try {
    const node = controller.read(path);
    return typeof node === 'object' && node !== null && Object.hasOwn(node, 'id')
      ? (node as Record<string, unknown>).id
      : undefined;
  } catch {
    return undefined;
  }
}

export function ItemIdField({ controller, path }: ItemIdFieldProps) {
  const { t } = useI18n();
  const inputId = useId();
  const noteId = useId();
  const { read, revision } = controller;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `revision` is the change signal for what `read` returns
  const index = useMemo(() => buildIdIndex(read), [read, revision]);
  const [refusal, setRefusal] = useState<string | null>(null);
  // The clearing ops waiting on the confirm.
  const [pendingClear, setPendingClear] = useState<readonly Op[] | null>(null);
  const [nonce, setNonce] = useState(0);
  const raw = readId(controller, path);
  const current = typeof raw === 'string' ? raw : undefined;
  const following = followers(index, current);

  const commit = (value: string) => {
    setNonce((n) => n + 1);
    const edit = idEdit(index, path, current, value);
    if (!edit.ok) {
      setRefusal(refusalText(edit, t));
      return;
    }
    setRefusal(null);
    if (edit.clears && following > 0) {
      setPendingClear(edit.ops);
    } else if (edit.ops.length > 0) {
      controller.applyAll(edit.ops);
    }
  };

  // An authored id that is not a string (`id: 3`) is a value the engine
  // rejects; a text box would show it as unset and the next entry would
  // overwrite it silently, so it is shown as written and left alone.
  const foreign = raw !== undefined && current === undefined;
  const note = foreign
    ? t('panel.id.foreign')
    : (refusal ?? (following > 0 ? t('panel.id.followers', { n: following }) : null));
  return (
    <div className="mb-2">
      <div className="flex items-center gap-1">
        <label className={FIELD_LABEL} htmlFor={inputId}>
          {t('panel.id.label')}
        </label>
        <HelpHint
          label={t('panel.section.helpLabel', { title: t('panel.id.label') })}
          title={t('panel.id.label')}
          body={t('panel.id.help')}
        />
      </div>
      <input
        key={`${current ?? ''}:${nonce}`}
        id={inputId}
        type="text"
        className={foreign ? `${INPUT} cursor-default bg-bg text-muted` : INPUT}
        defaultValue={foreign ? foreignText(raw) : (current ?? '')}
        readOnly={foreign}
        placeholder={t('panel.id.placeholder')}
        aria-describedby={note === null ? undefined : noteId}
        aria-invalid={refusal !== null}
        onBlur={(event) => {
          if (!foreign) {
            commit(event.currentTarget.value);
          }
        }}
        onKeyDown={(event) => {
          // Enter confirming an IME conversion must not commit mid-composition.
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.currentTarget.blur();
          }
        }}
      />
      {note === null ? null : (
        <p id={noteId} className="m-0 mt-1 text-muted text-xs">
          {note}
        </p>
      )}
      {pendingClear !== null ? (
        <IdClearConfirm
          count={following}
          onCancel={() => setPendingClear(null)}
          onConfirm={() => {
            controller.applyAll(pendingClear);
            setPendingClear(null);
          }}
        />
      ) : null}
    </div>
  );
}
