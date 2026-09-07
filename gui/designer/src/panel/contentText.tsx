// The content tab's PLAIN-text surface — the chip editor over `text:`, and the
// key hint under it. Split out of `ContentSection.tsx`, which is the per-type
// ROUTER: with the rich-text route beside the image, page-number, mark and
// iterable ones, the router no longer fits its own body, and the body is the
// part that is not routing. The other per-type surfaces already live beside it
// in `contentParts.tsx`.

import { isMacPlatform, modifierGlyph } from '../help/shortcutsModel';
import { useI18n } from '../i18n/context';
import type { ChipContext } from '../text/chipContext';
import { commitOps } from '../text/declCommit';
import { TextEditor } from '../text/TextEditor';
import { INPUT } from '../ui/chrome';
import { FieldGroup } from './fields';
import type { ItemPanelProps } from './itemPanelProps';

/** Ties the key hint to the editor it describes. One text field is on screen
 * at a time (the panel shows the selected item), so a constant is enough. */
const TEXT_HINT_ID = 'sj-text-keys';

export function TextContentField({
  props,
  chips,
}: {
  readonly props: ItemPanelProps;
  readonly chips: ChipContext;
}) {
  const { t } = useI18n();
  const { controller, path, view } = props;
  return (
    // FieldGroup, not Field: the editor is a contenteditable next to the
    // insert-a-field button, and a `<label>` around that pair sends every
    // click inside it to the button.
    <FieldGroup label={t('panel.field.text')}>
      {/* The wrapper is what `:focus-within` keys the hint off — it holds
          the editor and its hint, and nothing else. */}
      <div className="sj-text-field">
        <TextEditor
          // Keyed by value: the contenteditable seeds once per mount, so it
          // reseeds on an EXTERNAL change (undo, a delete shifting a sibling
          // into this slot) but not on a sibling field's commit — the property
          // panel no longer remounts wholesale per revision.
          key={view.text}
          value={view.text}
          // Two lines, so the field LOOKS like somewhere a line break
          // belongs. It was one line high, which is most of why a reader
          // concluded it could not hold two.
          className={`sj-text-editor min-h-[3.6em] ${INPUT}`}
          ariaLabel={t('panel.field.text')}
          ariaDescribedBy={TEXT_HINT_ID}
          chips={chips}
          onCommit={(v, declarations) =>
            controller.applyAll(
              commitOps({
                read: controller.read,
                path,
                oldText: view.text,
                newText: v,
                pending: declarations,
              }),
            )
          }
          // The draft goes through the SAME `commitOps` the commit does, so
          // what the canvas shows while typing cannot drift from what blur
          // will write — a staged chip's declaration included.
          onDraft={(draft) =>
            props.onTextDraft?.(
              draft === null
                ? null
                : commitOps({
                    read: controller.read,
                    path,
                    oldText: view.text,
                    newText: draft.value,
                    pending: draft.declarations,
                  }),
            )
          }
        />
        {/* Always rendered, so it can DESCRIBE the field for a screen
            reader; revealed visually only while the field has focus,
            because the panel has no room for a permanent line under every
            text field. */}
        <p className="sj-text-hint" id={TEXT_HINT_ID}>
          {t('panel.field.text.keys', { mod: modifierGlyph(isMacPlatform()) })}
        </p>
      </div>
    </FieldGroup>
  );
}
