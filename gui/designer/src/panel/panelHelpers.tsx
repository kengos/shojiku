// The small pieces the per-item tab sections share: the `?` help heading and
// the binding-picker wiring every content surface (text, image, the column
// forms' item-level twin) derives from the same item path. Split out of
// `ItemPanel.tsx` so the content/style/box sections beside it never import each
// other for a helper.

import { HelpHint } from '../help/HelpHint';
import { useI18n } from '../i18n/context';
import { type ChipContext, chipContextFor } from '../text/chipContext';
import { SECTION_TITLE } from '../ui/chrome';
import type { ItemPanelProps } from './itemPanelProps';
import { bindingPickOps } from './model';
import { bindingScopeFor, type PickerOption, scopeAuthorable } from './pickerModel';

/** Which panel concept a `?` explains. Each value is also the catalog SEGMENT
 * (`help.<topic>.title` / `.body`), so adding a topic is adding its two strings
 * rather than another branch here. */
export type HelpTopic = 'content' | 'style' | 'placement' | 'placementChild';

/** Which FIELD carries a `?`. The criterion is the user's: a field whose NAME
 * does not let a reader with little IT background infer what it does. `Cell
 * size` is deliberately absent — its name is self-evident, and the non-obvious
 * part of its BEHAVIOUR is already carried by the section's own hint line. Each
 * value is the catalog segment, exactly as `HelpTopic` is. */
export type FieldHelpTopic = 'rulingWidth' | 'rubySize' | 'kinsoku' | 'styleNames';

/** The `?` for one field, as opposed to `HelpfulHeading`'s for a whole section.
 * It renders the icon alone: the field's own label is right beside it, so a
 * repeated title in the trigger would be noise for a screen reader. */
export function FieldHelp({ topic }: { readonly topic: FieldHelpTopic }) {
  const { t } = useI18n();
  const titleKey = `help.${topic}.title` as const;
  return (
    <HelpHint label={t(titleKey)} title={t(titleKey)} body={t(`help.${topic}.body` as const)} />
  );
}

/** A section heading with a contextual `?` help popover beside it. The three
 * genuinely-confusing panel concepts (fixed-text-vs-data, the
 * default/inherited/style cascade, and where coordinates are measured FROM) each
 * get one; "learn more" opens the glossary. */
export function HelpfulHeading({
  title,
  topic,
  onOpenGlossary,
}: {
  readonly title: string;
  readonly topic: HelpTopic;
  readonly onOpenGlossary?: () => void;
}) {
  const { t } = useI18n();
  const titleKey = `help.${topic}.title` as const;
  const bodyKey = `help.${topic}.body` as const;
  return (
    // `SECTION_TITLE` carries the section's bottom margin, and inside a centred
    // flex line that margin sits within the line box: it pushed the heading text
    // up by half of it and left the hint icon 4px low. The row takes the margin,
    // and the h3 is stripped of it through a variant (a bare `mb-0` in the class
    // string would not win — utility order decides, not string order).
    <div className="mb-2 flex items-center gap-1 [&>h3]:mb-0">
      <h3 className={SECTION_TITLE}>{title}</h3>
      <HelpHint
        label={t(titleKey)}
        title={t(titleKey)}
        body={t(bodyKey)}
        onMore={onOpenGlossary}
        moreLabel={t('help.more')}
      />
    </div>
  );
}

/** The chip/binding context for the item at `path` — the ONE builder this
 * panel and the canvas overlay share, so the two chip surfaces never drift on
 * which fields they offer or which declarations they can label. */
export function chipsFor(props: ItemPanelProps): ChipContext {
  return chipContextFor(
    props.controller.read,
    props.path,
    props.paletteGroups,
    props.params,
    props.capabilities,
  );
}

/** The create-data-field opener, but ONLY at document scope — a fresh top-level
 * key cannot bind a row-scoped picker (a table column / cell). Undefined = no
 * tail (engineer schema, or a row-scoped picker). */
export function documentScopeCreateField(
  props: ItemPanelProps,
): ((bindKey: (key: string) => void) => void) | undefined {
  return bindingScopeFor(props.controller.read, props.path) === null
    ? props.onCreateField
    : undefined;
}

/** The scope wiring the item's `data.key` picker needs INSIDE a row scope: the
 * document-scope rows as a second section (armed only when the engine can
 * carry a scope), the authored scope for the closed-state badge, and the pick
 * handler that keeps `data.scope` matching the section the row came from —
 * one `applyAll`, so key and scope move as ONE undo step.
 *
 * Outside a row scope all three are absent: element and document resolve
 * identically there, so the picker stays exactly today's. */
export function scopePickerProps(
  props: ItemPanelProps,
  chips: ChipContext,
): {
  readonly documentOptions?: readonly PickerOption[];
  readonly scope?: string;
  readonly onPick?: (key: string, documentScoped: boolean) => void;
} {
  if (chips.scope === null) {
    return {};
  }
  const { controller, path, view, capabilities } = props;
  return {
    documentOptions: scopeAuthorable(capabilities) ? chips.documentOptions : undefined,
    scope: view.dataScope,
    onPick: (key: string, documentScoped: boolean) =>
      controller.applyAll(bindingPickOps(controller.read, path, key, documentScoped)),
  };
}
