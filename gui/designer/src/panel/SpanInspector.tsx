// The panel's half of inline rich text: everything about ONE fragment that the
// flow surface cannot say.
//
// Three things land here, and each for its own reason:
//   - a `data:` fragment's BINDING — its key, display format, blank placeholder
//     and (inside a row scope) document scope — because a bound fragment is
//     ATOMIC in the flow: the reader can delete it but cannot retype it, and
//     none of the binding's options has anything on the page to point at. It
//     is the same `Binding` an item's own `data:` is, so it is edited by the
//     same `BoundContent`, aimed at `<item>.spans[i]`;
//   - the METRIC style keys, because the flow editor is "deliberately NOT
//     WYSIWYG — the Designer never re-resolves fonts/styles"
//     (`canvas/InlineTextEditor`), so showing a size there would turn its line
//     breaks into a prediction of the engine's. A panel row is a VALUE and
//     claims nothing about how the page will break;
//   - `styleNames:`, which is a reference to the template registry rather than
//     anything a selection can point at.
//
// The four MARKS are deliberately absent: they belong to the selection, and a
// second control for them here would be a second way to say one thing.

import { useI18n } from '../i18n/context';
import type { ChipContext } from '../text/chipContext';
import { FIELD_LABEL } from '../ui/chrome';
import { BoundContent } from './contentBound';
import type { ItemPanelProps } from './itemPanelProps';
import { applyPanelOp, lengthOp, plainTextOp } from './model';
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
 * discover a missing registry entry. An absent key simply offers no control
 * (`spansModel`'s `SPAN_METRIC_KEYS` comment names the one that is absent). */
const METRIC_SPECS = STYLE_FIELDS.filter((spec) =>
  (SPAN_METRIC_KEYS as readonly string[]).includes(spec.key),
);

export interface SpanInspectorProps {
  readonly span: SpanView;
  /** The item's chip context — the binding picker's rows and row scope. A
   * fragment sits inside its item, so the two share both. */
  readonly chips: ChipContext;
  /** The ITEM's panel bundle — `path` is the item, and the fragment's own path
   * is derived from it and `span.index`. */
  readonly props: ItemPanelProps;
}

export function SpanInspector({ span, chips, props }: SpanInspectorProps) {
  const { t } = useI18n();
  const { controller, fontFamilies } = props;
  const path = spanPath(props.path, span.index);
  // Named for the FRAGMENT, not just the field. The format toolbar carries a
  // block-level control for several of these, and two controls answering to
  // one accessible name is a by-name query with two matches and a screen
  // reader saying the same words twice — the per-fragment link field already
  // scopes its name for exactly this reason, and a suite of its own caught the
  // omission here.
  const label = (field: string) => t('panel.spans.field', { n: span.index + 1, field });
  return (
    <section>
      <p className={FIELD_LABEL}>{t('panel.spans.fragment', { n: span.index + 1 })}</p>
      {span.bound ? (
        <BoundContent
          props={props}
          chips={chips}
          target={{
            path,
            dataKey: span.dataKey,
            format: span.format,
            placeholder: span.placeholder,
            dataScope: span.dataScope,
          }}
          label={label}
          bindingOptions={chips.options}
          dispatch={(op) => applyPanelOp(controller, op)}
        />
      ) : null}
      {METRIC_SPECS.map((spec) => (
        <StyleFieldInput
          key={spec.key}
          spec={spec}
          label={label(t(spec.labelKey))}
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
