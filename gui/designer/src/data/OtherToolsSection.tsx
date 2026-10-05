// 「ほかのツール向けの情報」 — what the definitions say for OTHER tools: for a
// field, the placement hint (`recommendedStyle`: the alignment and bold, merged
// into whatever else the bag holds); for a table, what one row is called
// (`items.title`). Nothing here changes what the Designer shows or prints, and
// the intro says so. Open, not collapsed: it holds at most two controls.
//
// The alignment is the shared segmented control (`ui/Segmented`) with 「指定なし」
// first (which clears it); an authored alignment outside the three is its own
// selected segment, kept until another is picked. A bag that is not a map is reported and
// left alone.

import type { Op } from '@shojiku/designer-core';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/context';
import { clip } from '../palette/fieldDisplay';
import { FIELD_LABEL, SECTION_TITLE } from '../ui/chrome';
import { Segmented } from '../ui/Segmented';
import { RuleInput } from './RuleInput';
import {
  BOLD,
  boldOp,
  readRecommended,
  readRowTitle,
  rowTitleOp,
  TEXT_ALIGNS,
  textAlignOp,
} from './recommendedStyle';

export interface OtherToolsProps {
  readonly definitions: string;
  readonly keysPath: readonly string[];
  readonly editable: boolean;
  readonly onDefEdit: (op: Op | null) => boolean;
}

function Shell({ children }: { readonly children: ReactNode }) {
  const { t } = useI18n();
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className={SECTION_TITLE}>{t('data.otherTools')}</h3>
      <p className="m-0 text-sm text-muted">{t('data.otherTools.intro')}</p>
      {children}
    </section>
  );
}

/** A field's placement hint. */
export function FieldOtherTools({ definitions, keysPath, editable, onDefEdit }: OtherToolsProps) {
  const { t } = useI18n();
  const read = readRecommended(definitions, keysPath);
  if (read.kind === 'unreadable') {
    return (
      <Shell>
        <p className="m-0 rounded bg-warn-bg px-1.5 py-0.5 text-sm text-warn-text">
          {t('data.otherTools.unreadable', { section: t('data.otherTools') })}
        </p>
      </Shell>
    );
  }
  const values: string[] = ['', ...TEXT_ALIGNS];
  if (read.textAlign !== '' && !values.includes(read.textAlign)) {
    values.push(read.textAlign);
  }
  const alignLabel = t('data.otherTools.align');
  const bold = read.fontWeight === BOLD;
  const other = read.fontWeight !== '' && !bold;
  return (
    <Shell>
      <span className="text-sm text-muted">{alignLabel}</span>
      <Segmented
        ariaLabel={alignLabel}
        value={read.textAlign}
        options={values.map((value) => ({
          value,
          label:
            (TEXT_ALIGNS as readonly string[]).includes(value) || value === ''
              ? t(`data.otherTools.align.${value === '' ? 'none' : value}`)
              : clip(value),
          disabled: !editable,
        }))}
        onChange={(value) => onDefEdit(textAlignOp(keysPath, read, value))}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={bold}
            disabled={!editable}
            onChange={(event) => onDefEdit(boldOp(keysPath, read, event.currentTarget.checked))}
          />
          {t('data.otherTools.bold')}
        </label>
        {other ? (
          <span className="text-sm text-muted">
            {t('data.otherTools.weightNow', {
              value: clip(read.fontWeight),
              bold: t('data.otherTools.bold'),
            })}
          </span>
        ) : null}
      </div>
      {/* Untrue while a hand-written weight remains: clearing these two leaves it. */}
      {other ? null : <p className="m-0 text-sm text-muted">{t('data.otherTools.emptyNote')}</p>}
      {read.others.length > 0 ? (
        <p className="m-0 text-sm text-muted">
          {t('data.otherTools.kept', { keys: read.others.map(clip).join(', ') })}
        </p>
      ) : null}
    </Shell>
  );
}

/** A table's row name. */
export function TableOtherTools({ definitions, keysPath, editable, onDefEdit }: OtherToolsProps) {
  const { t } = useI18n();
  const title = readRowTitle(definitions, keysPath);
  const label = t('data.otherTools.rowTitle');
  return (
    <Shell>
      <div className="flex flex-col gap-0.5">
        <span className={FIELD_LABEL}>{label}</span>
        <RuleInput
          label={label}
          value={title}
          editable={editable}
          placeholder={t('data.none')}
          onCommit={(raw) => {
            onDefEdit(rowTitleOp(keysPath, title, raw));
            return null;
          }}
        />
        <p className="m-0 text-sm text-muted">{t('data.otherTools.rowTitleHint')}</p>
      </div>
    </Shell>
  );
}
