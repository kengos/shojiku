// The chip editor's field-picking chrome: the insert menu, and — while a chip
// is selected — the menu that RE-PICKS that chip's field in place.
//
// Both menus plan through the same pure `planChipInsert`, so a replace mints,
// reuses and scopes a declaration exactly as an insert does. Nothing here knows
// about pruning the declaration a replace orphaned: the commit batch
// (`text/declCommit`) already removes a declared name the old text referenced
// and the new one does not, so swapping the chip in the DOM is the whole of it.
//
// Kept out of `text/TextEditor` so that component stays the seeding/commit
// shell: the editor owns the content and the staged declarations, this owns
// what the two menus offer and what a pick does to the DOM.

import { useI18n } from '../i18n/context';
import type { PickerOption } from '../panel/pickerModel';
import { IconChevronDown } from '../ui/icons';
import type { ChipContext } from './chipContext';
import { CHIP_WIRE_ATTR, type ChipMeta, chipLabelOf, serializeEditor } from './chipModel';
import { type ChipInsert, planChipInsert } from './declMint';
import type { PendingDecl } from './declModel';
import { insertChipAt, replaceChipAt } from './editorHandlers';
import { FieldMenuButton } from './FieldMenuButton';
import { InsertFieldMenu } from './InsertFieldMenu';

const REPLACE_TRIGGER =
  'flex cursor-pointer items-center gap-1 rounded-md border border-border bg-chrome px-2 text-sm text-text';

export interface ChipFieldMenusProps {
  readonly chips: ChipContext;
  readonly editor: {
    readonly el: HTMLDivElement;
    readonly meta: ReadonlyMap<string, ChipMeta>;
    /** The chip the user clicked, `null` when the last click was on ordinary
     * text. A chip is `user-select: none`, so it cannot ride the caret's own
     * selection and needs this. */
    readonly selected: Element | null;
  };
  readonly staging: {
    readonly pending: readonly PendingDecl[];
    readonly onStage: (decl: PendingDecl) => void;
  };
  /** A replace landed — the host drops the selection, since the node it named
   * is gone from the document. */
  readonly onReplaced: () => void;
}

export function ChipFieldMenus({ chips, editor, staging, onReplaced }: ChipFieldMenusProps) {
  const { t } = useI18n();
  // Read from the LIVE editor at pick time, never from a value captured when
  // this component rendered: the text has moved on with every keystroke since.
  const plan = (option: PickerOption, documentScoped: boolean): ChipInsert => {
    const planned = planChipInsert(option.key, documentScoped, {
      scope: chips.scope,
      declared: chips.declared,
      pending: staging.pending,
      text: serializeEditor(editor.el),
      offeredKeys: [...chips.options, ...chips.documentOptions].map((row) => row.key),
      otherNames: chips.otherNames,
    });
    if (planned.decl !== null) {
      staging.onStage(planned.decl);
    }
    return planned;
  };
  // Narrowed into a const so it survives into the pick callback below.
  const selected = editor.selected;
  const selectedLabel =
    selected === null ? '' : chipLabelOf(selected.getAttribute(CHIP_WIRE_ATTR), editor.meta);
  return (
    // ONE row for both triggers, and the positioning context both popovers
    // resolve against — so selecting a chip widens this row rather than adding
    // a second one under it (which pushed the whole panel down on every click
    // in the field), and each popover still spans the field's full width.
    <div className="relative mt-1 flex items-center gap-1">
      <InsertFieldMenu
        chips={chips}
        onInsert={(option, documentScoped) => {
          insertChipAt(
            editor.el,
            plan(option, documentScoped),
            { label: option.label, sample: option.sample },
            editor.meta,
          );
        }}
      />
      {selected === null ? null : (
        <FieldMenuButton
          chips={chips}
          trigger={{
            label: (
              <>
                {/* The label is a document-derived field name of unbounded
                 * length — without a cap one long name pushes the chevron out
                 * of the panel. The tooltip carries the full text. */}
                <span className="max-w-32 truncate">{selectedLabel}</span>
                <IconChevronDown />
              </>
            ),
            ariaLabel: t('chips.replace', { field: selectedLabel }),
            tooltip: t('chips.replace', { field: selectedLabel }),
            className: REPLACE_TRIGGER,
          }}
          onPick={(option, documentScoped) => {
            // Plan only once the target is still in the document: planning
            // STAGES a declaration, so planning for a replace that cannot land
            // would burn a minted name for a chip nobody wrote. `replaceChipAt`
            // re-checks too — that guard is the safety net, this is the
            // decision.
            if (editor.el.contains(selected)) {
              replaceChipAt(
                editor.el,
                selected,
                plan(option, documentScoped),
                { label: option.label, sample: option.sample },
                editor.meta,
              );
            }
            // Either way the selection is spent: the node it named is gone or
            // has just been swapped out.
            onReplaced();
          }}
        />
      )}
    </div>
  );
}
