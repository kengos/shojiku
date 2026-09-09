// The panel's half of inline rich text: everything about ONE fragment that the
// flow surface cannot say.
//
// Three things land here, and each for its own reason:
//   - the METRIC style keys, because the flow editor is "deliberately NOT
//     WYSIWYG — the Designer never re-resolves fonts/styles"
//     (`canvas/InlineTextEditor`), so showing a size there would turn its line
//     breaks into a prediction of the engine's. A panel row is a VALUE and
//     claims nothing about how the page will break;
//   - `styleNames:`, which is a reference to the template registry rather than
//     anything a selection can point at;
//   - a `data:` fragment's binding key, because a bound fragment is ATOMIC in
//     the flow — the reader can delete it but cannot retype it.
//
// The four MARKS are deliberately absent: they belong to the selection, and a
// second control for them here would be a second way to say one thing.

import { useI18n } from '../i18n/context';
import { FIELD_LABEL } from '../ui/chrome';
import { TextField } from './fields';
import type { ItemPanelProps } from './itemPanelProps';
import { applyPanelOp, bindingKeyOp, lengthOp, plainTextOp } from './model';
import { StyleFieldInput } from './StyleFieldInput';
import { StyleNamesPicker } from './StyleNamesPicker';
import { spanPath } from './spanLinkOps';
import { SPAN_METRIC_KEYS, type SpanView } from './spansModel';
import { STYLE_FIELDS } from './styleFieldSpecs';

/** The metric specs, drawn from the ONE registry the style form and the
 * defaults screen also read — so a spec that gains an option or a unit gains it
 * here too.
 *
 * Derived by INTERSECTION rather than by lookup-or-throw. The first cut threw
 * for a key the registry does not carry, at module scope, and took 29 unrelated
 * suites down with it at import time: a panel section is not a place to
 * discover a missing registry entry. An absent key simply offers no control,
 * and `spansModel`'s own comment says why that is the honest answer. */
const METRIC_SPECS = STYLE_FIELDS.filter((spec) =>
  (SPAN_METRIC_KEYS as readonly string[]).includes(spec.key),
);

export interface SpanInspectorProps {
  readonly span: SpanView;
  readonly itemPath: string;
  readonly controller: ItemPanelProps['controller'];
  readonly fontFamilies: readonly string[];
}

export function SpanInspector({ span, itemPath, controller, fontFamilies }: SpanInspectorProps) {
  const { t } = useI18n();
  const path = spanPath(itemPath, span.index);
  return (
    <section>
      <p className={FIELD_LABEL}>{t('panel.spans.fragment', { n: span.index + 1 })}</p>
      {span.dataKey === '' ? null : (
        <TextField
          // Named for the FRAGMENT, not just the field. The format toolbar
          // carries a block-level control for several of these, and two
          // controls answering to one accessible name is a by-name query with
          // two matches and a screen reader saying the same words twice — the
          // per-fragment link field already scopes its name for exactly this
          // reason, and a suite of its own caught the omission here.
          label={t('panel.spans.field', { n: span.index + 1, field: t('panel.field.dataKey') })}
          value={span.dataKey}
          onCommit={(next: string) =>
            applyPanelOp(controller, next === span.dataKey ? null : bindingKeyOp(path, next))
          }
        />
      )}
      {METRIC_SPECS.map((spec) => (
        <StyleFieldInput
          key={spec.key}
          spec={spec}
          label={t('panel.spans.field', { n: span.index + 1, field: t(spec.labelKey) })}
          value={span.metrics[spec.key]}
          // No `optionLabel`: neither metric spec CARRIES options (a size is a
          // length, a family is free text), so a label mapper here would be a
          // callback nothing can call.
          noneLabel={t('panel.field.formatNone')}
          fontFamilies={fontFamilies}
          familyListId={`sj-span-family-${span.index}`}
          // A cleared field REMOVES the key rather than writing an empty
          // string: an empty `fontSize` is not a size the engine can parse, and
          // the minimal-wire rule the declaration modules follow says a key is
          // authored only where it says something.
          onCommit={(next: string) =>
            // `applyPanelOp` takes `Op | null` precisely so the CALLER decides
            // whether a write is owed: `applyAll` reports ok for a no-op batch
            // and BUMPS THE REVISION, which is a dirty flag for an edit nobody
            // made — and a field re-committed on blur at its own value is the
            // ordinary way that happens.
            applyPanelOp(
              controller,
              next === span.metrics[spec.key]
                ? null
                : spec.kind === 'length'
                  ? lengthOp(path, ['style', spec.key], next)
                  : plainTextOp(path, ['style', spec.key], next),
            )
          }
        />
      ))}
      <StyleNamesPicker controller={controller} path={path} styleNames={span.styleNames} />
      <p className="text-sm text-muted">{t('panel.spans.editHint')}</p>
    </section>
  );
}
