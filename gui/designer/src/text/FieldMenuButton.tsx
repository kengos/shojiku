// A chip-editor field menu: one trigger button opening the binding picker's
// rows. Both of the editor's menus are this component — inserting a new chip
// and re-picking a selected chip's field differ in what the trigger SAYS and
// what a pick DOES, never in which rows are on offer (that derivation is the
// pure `text/fieldMenuModel`) or how they are drawn (the shared
// `panel/PickerPopover`, so the chip menus and the property panel's picker
// cannot drift into two looks).

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { usePopover } from '../hooks/usePopover';
import { useI18n } from '../i18n/context';
import { PickerPopover } from '../panel/PickerPopover';
import type { PickerOption } from '../panel/pickerModel';
import { TipBubble } from '../ui/TipBubble';
import type { ChipContext } from './chipContext';
import { fieldMenu } from './fieldMenuModel';

export interface FieldMenuTrigger {
  /** The button's visible content. */
  readonly label: ReactNode;
  /** Its accessible name. Explicit because the property panel wraps the whole
   * editor in a `<label>`, whose text would otherwise NAME every button
   * inside it — leaving two identically-named controls in one field. Keep the
   * visible text contained in it (WCAG label-in-name) so voice control can
   * still reach the button by what it says. */
  readonly ariaLabel: string;
  /** Instant-tooltip text. Required, because neither trigger's visible label
   * states its action: the insert one is icon-only and the replace one reads
   * as the bound field's name, a noun. Never a native `title` — its
   * OS-controlled delay reads as no tooltip at all. */
  readonly tooltip: string;
  readonly className: string;
}

export interface FieldMenuButtonProps {
  readonly chips: ChipContext;
  readonly trigger: FieldMenuTrigger;
  /** Act on the picked row. `documentScoped` marks a row from the
   * document-data section — the pick a declaration would exist for. */
  readonly onPick: (option: PickerOption, documentScoped: boolean) => void;
}

export function FieldMenuButton({ chips, trigger, onPick }: FieldMenuButtonProps) {
  const { t } = useI18n();
  const { open, setOpen, rootRef } = usePopover();
  const [query, setQuery] = useState('');
  const menu = fieldMenu(chips, query);
  // A dismissal that is not a pick — Escape, a pointer outside — used to leave
  // the filter set, so the next open showed a narrowed list with nothing on
  // screen saying why. Re-opening is the common motion for the replace menu.
  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);
  return (
    // Deliberately NOT a positioning context: the popover resolves against the
    // enclosing menu ROW instead, so it spans the field's width rather than one
    // trigger's, and the two triggers can sit side by side.
    <div className="inline-flex" ref={rootRef}>
      <button
        type="button"
        className={`group/tip relative ${trigger.className}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={trigger.ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger.label}
        <TipBubble text={trigger.tooltip} />
      </button>
      {open ? (
        <PickerPopover
          query={query}
          onQuery={setQuery}
          offered={menu.offered}
          sections={menu.sections.map((section) => ({
            id: section.id,
            heading: section.headingKey === null ? null : t(section.headingKey),
            rows: section.rows,
            doc: section.doc,
          }))}
          onPickRow={(option, documentScoped) => {
            // Closing resets the query through the effect above, so a pick and
            // a dismissal leave the menu in the same state.
            setOpen(false);
            onPick(option, documentScoped);
          }}
        />
      ) : null}
    </div>
  );
}
