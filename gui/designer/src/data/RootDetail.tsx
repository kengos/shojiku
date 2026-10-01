// The right pane for the definitions ROOT (「データ全体の情報」): the document's own
// `title`, `description` and `version`. The root has no parent, so it has no
// required flag; which top-level items are required is each item's own checkbox.

import { useI18n } from '../i18n/context';
import { Field } from '../panel/fields';
import { INPUT, SECTION_TITLE } from '../ui/chrome';
import { descriptionOp, readDefinitionField, titleOp, versionOp } from './definitionsEdit';
import type { DetailContext } from './detailContext';

export function RootDetail({ ctx }: { readonly ctx: DetailContext }) {
  const { t } = useI18n();
  const def = readDefinitionField(ctx.definitions, []);
  return (
    <section className="flex flex-col gap-3">
      <h3 className={SECTION_TITLE}>{t('data.definition')}</h3>
      <Field label={t('data.field.label')}>
        <input
          key={def.title}
          type="text"
          className={INPUT}
          defaultValue={def.title}
          readOnly={!ctx.editable}
          onBlur={(event) => ctx.onDefEdit(titleOp([], def.title, event.currentTarget.value))}
        />
      </Field>
      <Field label={t('data.field.description')}>
        <textarea
          key={def.description}
          className={`${INPUT} min-h-[4rem] resize-y`}
          defaultValue={def.description}
          readOnly={!ctx.editable}
          onBlur={(event) =>
            ctx.onDefEdit(descriptionOp([], def.description, event.currentTarget.value))
          }
        />
      </Field>
      <Field label={t('data.root.version')}>
        <input
          key={def.version}
          type="text"
          className={`${INPUT} max-w-[10rem] font-mono`}
          defaultValue={def.version}
          readOnly={!ctx.editable}
          onBlur={(event) => ctx.onDefEdit(versionOp([], def.version, event.currentTarget.value))}
        />
      </Field>
      <p className="m-0 -mt-2 text-sm text-muted">{t('data.root.versionHint')}</p>
    </section>
  );
}
