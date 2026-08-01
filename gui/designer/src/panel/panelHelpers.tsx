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

/** A section heading with a contextual `?` help popover beside it. The two
 * genuinely-confusing panel concepts (fixed-text-vs-data, and the
 * default/inherited/style cascade) each get one; "learn more" opens the glossary. */
export function HelpfulHeading({
  title,
  topic,
  onOpenGlossary,
}: {
  readonly title: string;
  readonly topic: 'content' | 'style';
  readonly onOpenGlossary?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-1">
      <h3 className={SECTION_TITLE}>{title}</h3>
      <HelpHint
        label={t(topic === 'content' ? 'help.content.title' : 'help.style.title')}
        title={t(topic === 'content' ? 'help.content.title' : 'help.style.title')}
        body={t(topic === 'content' ? 'help.content.body' : 'help.style.body')}
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
