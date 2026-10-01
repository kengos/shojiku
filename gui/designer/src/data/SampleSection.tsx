// The SAMPLE half of the data-item editor's right pane for a field: one value at
// its params path, or one value per row of the table carrying it (a focused
// column view with add/remove row), or — for a table nested in another table's
// rows, whose rows exist per parent row — the no-rows note.
//
// Every widget is uncontrolled and keyed by its own value (the pane is not keyed
// by the selection). The 「sample value」 heading is the section's ONE label and
// carries the `?`; its sentence describes what the data IS, so it holds in every
// arm (single / rows / none, editable / read-only mounted host).

import type { ReactNode } from 'react';
import { HelpHint } from '../help/HelpHint';
import { useI18n } from '../i18n/context';
import type { PaletteField } from '../palette/model';
import type { SampleKind, SamplePath } from '../sample/model';
import { BTN_SM, SECTION_TITLE } from '../ui/chrome';
import type { DefsNode } from './defsTree';
import type { DetailContext } from './detailContext';
import { arrayLength, readAt } from './editorModel';
import { sampleSpot } from './treeModel';
import { ReadonlyValue, ValueField } from './ValueField';

interface SampleProps {
  readonly node: DefsNode;
  readonly leaf: PaletteField;
  readonly kind: SampleKind;
  readonly ctx: DetailContext;
}

function Value({
  leaf,
  kind,
  ctx,
  path,
  compact,
}: SampleProps & {
  readonly path: SamplePath;
  readonly compact: boolean;
}) {
  const value = readAt(ctx.params, path);
  if (!ctx.canEditSample) {
    return <ReadonlyValue value={value} options={leaf.enumOptions} />;
  }
  return (
    <ValueField
      key={value}
      label={leaf.label}
      kind={kind}
      value={value}
      engineLocale={ctx.engineLocale}
      options={leaf.enumOptions}
      compact={compact}
      onCommit={(raw) => ctx.onCommitSample(path, kind, raw)}
    />
  );
}

function Rows(props: SampleProps & { readonly arrayPath: SamplePath; readonly rel: SamplePath }) {
  const { t } = useI18n();
  const { ctx, arrayPath, rel } = props;
  const rows = arrayLength(ctx.params, arrayPath);
  return (
    <div className="flex flex-col gap-2">
      {rows === 0 ? <p className="m-0 text-sm text-muted">{t('sample.emptyReadOnly')}</p> : null}
      {Array.from({ length: rows }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: sample rows are a stable order-preserving list with no identity of their own (the index IS the row).
        <fieldset key={`${index}`} className="rounded-md border border-border p-2">
          <legend className="px-1 text-sm text-muted">{`#${index + 1}`}</legend>
          <Value {...props} path={[...arrayPath, index, ...rel]} compact />
          {ctx.canEditSample ? (
            <button
              type="button"
              className={BTN_SM}
              onClick={() => ctx.onRemoveRow(arrayPath, index)}
            >
              {t('sample.removeRow')}
            </button>
          ) : null}
        </fieldset>
      ))}
      {ctx.canEditSample ? (
        <button
          type="button"
          className={`${BTN_SM} self-start`}
          onClick={() => ctx.onAddRow(arrayPath)}
        >
          {t('sample.addRow')}
        </button>
      ) : null}
    </div>
  );
}

export function SampleSection(props: SampleProps) {
  const { t } = useI18n();
  const spot = sampleSpot(props.ctx.tree, props.node);
  let body: ReactNode;
  if (spot.kind === 'single') {
    body = <Value {...props} path={spot.path} compact={false} />;
  } else if (spot.kind === 'rows') {
    body = <Rows {...props} arrayPath={spot.arrayPath} rel={spot.rel} />;
  } else {
    body = <p className="m-0 text-sm text-muted">{t('sample.emptyReadOnly')}</p>;
  }
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <h3 className={`${SECTION_TITLE} mb-0`}>{t('data.sampleValue')}</h3>
        <HelpHint
          label={t('help.sampleValue.title')}
          title={t('help.sampleValue.title')}
          body={t('help.sampleValue.body')}
        />
      </div>
      {body}
    </section>
  );
}
