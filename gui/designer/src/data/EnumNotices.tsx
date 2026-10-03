// What the engine will do with a set of choices that the table alone does not
// show: labels it will IGNORE — a field that does not print as plain text (the
// `definitions_enum_labels_ignored` predicate, mirrored in `enumRules.ts`), or
// any list element, since a list prints each value as it is — members that can
// never MATCH (a value not of the field's type), and an authored EMPTY list,
// which makes every value warn. The labels sentence names the two controls that
// decide it by their own label keys.

import { useI18n } from '../i18n/context';
import { TYPE_OPTION_KEY } from './editorModel';
import type { EnumTarget } from './enumEdits';
import { labelsIgnored, memberMismatch } from './enumRules';

const NOTICE = 'm-0 flex flex-col gap-0.5 rounded bg-warn-bg px-2 py-1 text-sm text-warn-text';

export interface EnumNoticesProps {
  readonly target: EnumTarget;
  readonly format: string;
  /** Without editing, a notice states the fact and asks for nothing. */
  readonly editable: boolean;
  /** The document carries `enum: []`. */
  readonly authoredEmpty: boolean;
  /** A list ELEMENT's choices. */
  readonly list: boolean;
}

export function EnumNotices({ target, format, editable, authoredEmpty, list }: EnumNoticesProps) {
  const { t } = useI18n();
  const { type, rows } = target;
  const mismatched = rows.some((row) => memberMismatch(type, row.value));
  // The field's own type, by the type select's label (a mismatch can only be
  // flagged on one of the four base types).
  const typeName = Object.hasOwn(TYPE_OPTION_KEY, type)
    ? t(TYPE_OPTION_KEY[type as keyof typeof TYPE_OPTION_KEY])
    : type;
  // A field's notice carries a title; a list's says it all in one sentence.
  let labels: { title: string | null; body: string } | null = null;
  if (list && rows.some((row) => row.labeled)) {
    labels = { title: null, body: t('data.element.labelsIgnored') };
  } else if (!list && labelsIgnored(type, format, rows)) {
    const body = t('data.choices.labelsIgnoredBody', {
      type: t('data.field.type'),
      text: t(TYPE_OPTION_KEY.string),
      format: t('data.field.format'),
      none: t('data.field.formatNone'),
    });
    labels = { title: t('data.choices.labelsIgnoredTitle'), body };
  }
  return (
    <>
      {authoredEmpty ? (
        <p role="note" className={NOTICE}>
          {t('data.choices.empty')}
          {editable ? ` ${t('data.choices.emptyFix')}` : null}
        </p>
      ) : null}
      {labels === null ? null : (
        <div role="note" className={NOTICE}>
          {labels.title === null ? null : <b>{labels.title}</b>}
          <span>{labels.body}</span>
        </div>
      )}
      {mismatched ? (
        <p role="note" className={NOTICE}>
          {t(editable ? 'data.choices.mismatch' : 'data.choices.mismatchReadonly', {
            type: typeName,
          })}
        </p>
      ) : null}
    </>
  );
}
