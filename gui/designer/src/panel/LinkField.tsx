// The ITEM's own hyperlink on the CONTENT tab (`link: { url }` on a `text` or
// an `image`). The control itself is `panel/LinkUrlField`, shared with the
// per-fragment field in `panel/SpansSection`; what lives here is this surface's
// two gates and its wiring.
//
// It carries BOTH gates, like `CharGridMarkupField`: the TYPE test, because
// only `text` and `image` have the key at the item level, and the CAPABILITY
// test, because an older engine rejects `link:` at parse.
//
// A link is a PDF `/URI` annotation: `render-png` paints none and the box index
// carries no link either, so neither the preview nor the canvas overlay can
// show one and this field is the only place the fact exists.

import { useI18n } from '../i18n/context';
import { linkSurfaceNames, readItem } from '../text/declModel';
import { hasCapability, type ItemPanelProps } from './itemPanelProps';
import { LinkUrlField } from './LinkUrlField';
import { LINK_CAPABILITY, LINK_TYPES, readLinkUrl } from './linkModel';
import { linkCommitOps } from './linkOps';
import { chipsFor, FieldHelp } from './panelHelpers';
import { useReseedKey } from './useReseedKey';

/** One item is selected at a time, so a constant ties the label to its input
 * (the `TEXT_HINT_ID` precedent in `ContentSection`). The FRAGMENT field's id is
 * derived per row instead — several fragments share one panel. */
const URL_INPUT_ID = 'sj-link-url';

export function LinkField(props: ItemPanelProps) {
  const { t } = useI18n();
  const { controller, path, view, capabilities } = props;
  const currentUrl = readLinkUrl(controller.read, path);
  const seed = useReseedKey(currentUrl);
  const chips = chipsFor(props);
  if (!LINK_TYPES.has(view.type) || !hasCapability(capabilities, LINK_CAPABILITY)) {
    return null;
  }
  return (
    <LinkUrlField
      id={URL_INPUT_ID}
      label={t('panel.link.label')}
      insertLabel={t('panel.link.insert')}
      currentUrl={currentUrl}
      chips={chips}
      // NOT `chips.otherNames`: that set is built for the TEXT surface, so it
      // holds this item's own `link.url` and omits its `text:`. Minting from it
      // would reserve the URL being edited and leave the item's static text
      // free to be redirected — the exact defect one declaration map per item
      // makes possible.
      otherNames={[...linkSurfaceNames(readItem(controller.read, path))]}
      commit={(typed, pending) => {
        const ops = linkCommitOps({
          read: controller.read,
          path,
          currentUrl,
          next: typed,
          pending,
        });
        // NOT unconditional: `applyAll([])` reports ok and BUMPS THE REVISION,
        // so dispatching the empty batch an unchanged blur produces would mint
        // a document revision — and a dirty flag — for a tab-through that
        // authored nothing.
        if (ops.length > 0) {
          controller.applyAll(ops);
        }
      }}
      help={<FieldHelp topic="link" />}
      seed={seed}
    />
  );
}
