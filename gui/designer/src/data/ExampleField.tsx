// The generation EXAMPLE of a field (`example`), under its sample value(s): what
// 「サンプルを生成」 puts in the data first. It is a DEFINITIONS key, so the badge
// says where it is saved and that every sample variant shares it — and it stays
// editable on a host whose sample data is read-only.
//
// Typed by the field: a number / whole number for number / integer (refused
// otherwise), a yes / no select for a boolean, text for everything else. A
// container example (legal wire, nothing this field can edit) is shown verbatim
// and left alone.

import type { Op } from '@shojiku/designer-core';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/context';
import { sampleDisplay } from '../palette/fieldDisplay';
import { FIELD_LABEL, INPUT } from '../ui/chrome';
import { useNumberRefusal } from './RangeFields';
import { RuleInput } from './RuleInput';
import { exampleEditable, exampleOp, shownScalar } from './valueRules';

export interface ExampleFieldProps {
  readonly keysPath: readonly string[];
  /** The field's base type (`string` / `number` / `integer` / `boolean`). */
  readonly type: string;
  readonly example: unknown;
  readonly editable: boolean;
  readonly onDefEdit: (op: Op | null) => void;
}

export function ExampleField({ keysPath, type, example, editable, onDefEdit }: ExampleFieldProps) {
  const { t } = useI18n();
  const refusalText = useNumberRefusal();
  const label = t('data.example');
  const commit = (raw: string) => {
    const edit = exampleOp(keysPath, type, example, raw);
    if (!edit.ok) {
      return refusalText(edit.refusal);
    }
    onDefEdit(edit.op);
    return null;
  };
  let control: ReactNode;
  if (!exampleEditable(example)) {
    control = (
      <>
        <p className="m-0 font-mono text-sm">{sampleDisplay(example)}</p>
        <p className="m-0 text-sm text-muted">{t('data.exampleReadonly')}</p>
      </>
    );
  } else if (type === 'boolean') {
    control = (
      <select
        className={INPUT}
        aria-label={label}
        disabled={!editable}
        value={shownScalar(example)}
        onChange={(event) => commit(event.currentTarget.value)}
      >
        <option value="">{t('data.none')}</option>
        <option value="true">{t('panel.value.on')}</option>
        <option value="false">{t('panel.value.off')}</option>
      </select>
    );
  } else {
    control = (
      <RuleInput
        label={label}
        value={shownScalar(example)}
        editable={editable}
        placeholder={t('data.none')}
        onCommit={commit}
      />
    );
  }
  return (
    <div className="flex flex-col gap-0.5 border-t border-dashed border-border pt-2">
      <span className={`${FIELD_LABEL} flex flex-wrap items-center gap-1.5`}>
        {label}
        <span className="rounded border border-border px-1 text-xs">{t('data.exampleSaved')}</span>
      </span>
      {control}
    </div>
  );
}
