// The content tab for a text item carrying `spans:` — inline rich text, which
// until now the Designer showed nothing of. It REPLACES the text/data pair for
// such an item, because `spans` takes precedence over `text`/`data` when
// non-empty: the pair was editing a key the engine ignores.
//
// Master-detail rather than a link field per fragment, for three reasons that
// all fall out of the panel being a ~255px column: the largest bundled example
// holds EIGHTEEN fragments; N link fields would be N controls answering to one
// accessible name (and N copies of one DOM id); and the badge on each row is
// what lets the list answer "which fragments carry a link" without clicking.
//
// A fragment's TEXT is not editable here — that is the wire's rich-text
// authoring surface, which does not exist yet in any form. The row is a
// selector; the link is what this surface edits.

import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { readItem, spanLinkSurfaceNames } from '../text/declModel';
import { BTN_SM } from '../ui/chrome';
import { IconLink } from '../ui/icons';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import { LinkUrlField } from './LinkUrlField';
import { LINK_CAPABILITY } from './linkModel';
import { chipsFor, HelpfulHeading } from './panelHelpers';
import { clearIgnoredContentOps, spanLinkCommitOps } from './spanLinkOps';
import { readSpans, type SpanView } from './spansModel';
import { useReseedKey } from './useReseedKey';

/** What a row shows for its fragment. A span carries `text` OR a `data:`
 * binding; both empty is the engine's `empty_span`, which still has to render
 * as SOMETHING — a blank row is a control with no label. */
function preview(
  t: (key: string, args?: Readonly<Record<string, string | number | boolean>>) => string,
  span: SpanView,
): string {
  // `data` is asked FIRST because that is the engine's own order —
  // `resolve_content` returns the binding before it looks at `text`, and
  // `validate/spans.rs` reports the conflict with `winner: data`. A fragment
  // carrying both is a document the engine warns about, and the row is its
  // only view: naming the losing half would point at content the page does
  // not draw.
  if (span.dataKey !== '') {
    return t('panel.spans.bound', { key: span.dataKey });
  }
  if (span.text !== '') {
    return span.text;
  }
  return t('panel.spans.empty');
}

export function SpansSection(props: ItemPanelProps) {
  const { t } = useI18n();
  const { controller, path, view, capabilities } = props;
  const spans = readSpans(controller.read, path);
  const [selected, setSelected] = useState(spans[0]?.index ?? 0);
  // The wire moves under the selection — a fragment can be deleted in YAML, or
  // the list can shrink — so the row is looked up rather than indexed.
  const active = spans.find((span) => span.index === selected) ?? null;
  const chips = chipsFor(props);
  const seed = useReseedKey(active?.url ?? '');

  return (
    <section>
      <HelpfulHeading
        title={t('panel.spans.heading')}
        topic="spans"
        onOpenGlossary={props.onOpenGlossary}
      />
      {view.hasText || view.hasData ? (
        <div className="mb-2 rounded-md bg-error-bg px-2 py-1">
          <p className="text-sm text-error-text">{t('panel.spans.conflict')}</p>
          <button
            type="button"
            className={`${BTN_SM} mt-1`}
            onClick={() =>
              controller.applyAll(clearIgnoredContentOps(path, view.hasText, view.hasData))
            }
          >
            {t('panel.spans.conflict.clear')}
          </button>
        </div>
      ) : null}
      <ul className="mb-2 rounded-md border border-border">
        {spans.map((span) => (
          <li key={span.index}>
            <button
              type="button"
              aria-current={span.index === selected ? 'true' : undefined}
              // Composed from the catalog with the ordinal and the fragment's
              // own text as ICU ARGS, never concatenated from the children: the
              // row's parts are separate elements, so the computed name would
              // otherwise run them together ("2linksHas a link"). The link mark
              // is part of this name because an `aria-label` REPLACES the
              // content, so a visually-hidden sibling would go unread.
              aria-label={t(span.url === '' ? 'panel.spans.row' : 'panel.spans.rowLinked', {
                n: span.index + 1,
                content: preview(t, span),
              })}
              className={`flex w-full items-center gap-1 px-2 py-1 text-left text-sm ${
                span.index === selected ? 'bg-accent-bg text-text' : 'text-muted'
              }`}
              onClick={() => setSelected(span.index)}
            >
              <span className="w-5 shrink-0 tabular-nums">{span.index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{preview(t, span)}</span>
              {span.url === '' ? null : <IconLink size={14} />}
            </button>
          </li>
        ))}
      </ul>
      {active === null || !hasCapability(capabilities, LINK_CAPABILITY) ? null : (
        <LinkUrlField
          id={`sj-span-link-${active.index}`}
          label={t('panel.spans.link.label', { n: active.index + 1 })}
          insertLabel={t('panel.spans.link.insert', { n: active.index + 1 })}
          currentUrl={active.url}
          chips={chips}
          // The third per-surface set: this item's `text:`, its OWN `link.url`,
          // every fragment's text and every OTHER fragment's link URL. Neither
          // set the item-level field can use is correct here — see
          // `text/declModel`'s `spanLinkSurfaceNames`.
          otherNames={[...spanLinkSurfaceNames(readItem(controller.read, path), active.index)]}
          commit={(typed, pending) => {
            const ops = spanLinkCommitOps({
              read: controller.read,
              itemPath: path,
              index: active.index,
              currentUrl: active.url,
              next: typed,
              pending,
            });
            if (ops.length > 0) {
              controller.applyAll(ops);
            }
          }}
          seed={seed}
        />
      )}
    </section>
  );
}
