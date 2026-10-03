// The 「データ名を変更」 form under the detail header: the new data name (the
// same rules as adding one, checked as it is typed, plus the two the template
// imposes), the change as one `old → new` line in the node's OWN name, what else
// the rename rewrites — this template's places that use it, and every sample
// variant (or, on a host that manages its own sample data, that it is left
// alone) — and the one undo that takes all of it back. A project-scoped file
// adds that the project's other templates are NOT rewritten.
//
// Every refusal the template imposes (a `{key}` that could not spell the name, a
// capturing `bindings:` name, too many places, a walk that could not finish)
// shows as the name is typed; the two only the full plan sees (a document over
// its size cap, the edit-list cap) arrive on submit, in the same place.

import { MAX_BATCH_OPS } from '@shojiku/designer-core';
import { useId, useState } from 'react';
import { useI18n } from '../i18n/context';
import { MAX_FIELD_NAME_CHARS } from '../insert/fieldModel';
import { BTN_SM, FIELD_LABEL, INPUT } from '../ui/chrome';
import { MAX_DEFS_EDITS } from './defsPlan';
import type { DefsNode } from './defsTree';
import type { RestructureActions } from './detailContext';
import { placeCount } from './refs/match';
import type { DataRef } from './refs/types';
import type { RestructureRefusal } from './renamePlan';
import { UsageList } from './UsageList';

export interface RenameFormProps {
  readonly node: DefsNode;
  readonly refs: readonly DataRef[];
  readonly actions: RestructureActions;
  readonly onClose: () => void;
}

/** The message for a refusal (`same_name` has none: the button is simply off). */
export function useRefusalText(): (reason: RestructureRefusal, name: string) => string | null {
  const { t } = useI18n();
  return (reason, name) =>
    reason === 'same_name'
      ? null
      : t(`data.error.${reason}`, {
          undo: t('data.undo'),
          max: MAX_FIELD_NAME_CHARS,
          name,
          ops: MAX_BATCH_OPS,
          edits: MAX_DEFS_EDITS,
        });
}

/** What the rename says about the sample data: rewritten with the template
 * (undone together), rewritten alone, or — on a host that manages its own
 * sample data — left as it is. */
function samplesKey(count: number, readOnly: boolean): string {
  if (readOnly) {
    return count > 0 ? 'data.rename.templateOnly' : 'data.sample.untouched';
  }
  return count > 0 ? 'data.rename.samples' : 'data.rename.samplesOnly';
}

export function RenameForm({ node, refs, actions, onClose }: RenameFormProps) {
  const { t } = useI18n();
  const refusalText = useRefusalText();
  const [name, setName] = useState(node.name);
  const [late, setLate] = useState<RestructureRefusal | null>(null);
  const inputId = useId();
  const hintId = useId();
  const next = name.trim();
  const live = next === '' ? 'empty_name' : actions.check(node, next);
  const shown = late ?? (next === '' ? null : live);
  const message = shown === null ? null : refusalText(shown, next);
  const count = placeCount(refs);
  return (
    <form
      aria-label={t('data.rename.open')}
      className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const refusal = actions.rename(node, next);
        if (refusal === null) {
          onClose();
        } else {
          setLate(refusal);
        }
      }}
    >
      <div>
        <label htmlFor={inputId} className={FIELD_LABEL}>
          {t('data.rename.newName')}
        </label>
        <input
          id={inputId}
          type="text"
          className={`${INPUT} font-mono`}
          aria-describedby={hintId}
          value={name}
          onChange={(event) => {
            setName(event.currentTarget.value);
            setLate(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.nativeEvent.isComposing) {
              event.preventDefault();
            }
          }}
        />
        <span id={hintId} className="text-sm text-muted">
          {t('data.rename.labelHint', { label: t('data.field.label') })}
        </span>
      </div>
      {message === null ? null : <output className="text-sm text-error-text">{message}</output>}
      {live === null ? (
        <p className="m-0 font-mono text-sm [overflow-wrap:anywhere]">
          {t('data.rename.diff', { from: node.name, to: next })}
        </p>
      ) : null}
      {/* What the rename will do — withheld while a refusal says it will not. */}
      {live === null || live === 'same_name' ? (
        <div className="flex flex-col gap-1 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-text">
          {count > 0 ? (
            <>
              <b>{t('data.rename.rewrite', { count })}</b>
              <UsageList refs={refs} />
            </>
          ) : null}
          <span>{t(samplesKey(count, actions.sampleReadOnly), { undo: t('data.undo') })}</span>
        </div>
      ) : null}
      {actions.projectScoped ? (
        <div className="flex flex-col gap-1 rounded-md bg-error-bg px-3 py-2 text-sm text-error-text">
          <b>{t('data.rename.sharedTitle')}</b>
          <span>{t('data.rename.shared', { name: node.name })}</span>
        </div>
      ) : null}
      <div className="flex gap-1">
        <button type="submit" className={BTN_SM} disabled={live !== null}>
          {t('data.rename.submit')}
        </button>
        <button type="button" className={BTN_SM} onClick={onClose}>
          {t('data.add.cancel')}
        </button>
      </div>
    </form>
  );
}
