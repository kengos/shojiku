// The chip editor's insert-a-field control: the shared `FieldMenuButton` under
// an "insert" trigger.
//
// What it offers depends on what the connected engine can express, and that
// rule lives in the pure `text/fieldMenuModel` the replace menu shares.
// Against an engine that understands `bindings:`, EVERY field is offerable — a
// key outside the interpolation charset gets a declared name, and a row-scoped
// item gains a second section of document-scope fields the bare `{key}` grammar
// could never reach into a cell. Against an older one the menu keeps the
// charset filter and shows no second section, because the declaration it would
// need is a parse error there. Picking a row only reports WHICH field was
// picked and from which section; how that becomes wire is the pure
// `planChipInsert`'s call.

import { useI18n } from '../i18n/context';
import type { PickerOption } from '../panel/pickerModel';
import { IconPlus } from '../ui/icons';
import type { ChipContext } from './chipContext';
import { FieldMenuButton } from './FieldMenuButton';

/** Icon-only, so this trigger and the replace one fit the property panel's
 * ~255px field on ONE row: two text buttons never could, and a second row
 * pushed the whole panel down every time a chip was selected. The action's
 * name rides the instant tooltip, which is the convention for an icon-only
 * control (never a native `title`). */
const INSERT_TRIGGER =
  'flex cursor-pointer items-center rounded-md border border-border bg-chrome px-1.5 py-1 text-text';

export interface InsertFieldMenuProps {
  readonly chips: ChipContext;
  /** Insert a chip for the picked field. `documentScoped` marks a row from the
   * document-data section, the pick the declaration exists for. */
  readonly onInsert: (option: PickerOption, documentScoped: boolean) => void;
  /** The trigger's accessible name and tooltip, when the default would COLLIDE.
   * The content tab now shows two of these menus at once for a text item — one
   * inserting into the text, one into the link URL — and two controls answering
   * to one name is a by-name query with two matches and a screen reader saying
   * the same words twice. Each host names its own; omitted keeps the general
   * wording, which is right wherever there is only one on screen. */
  readonly label?: string;
}

export function InsertFieldMenu({ chips, onInsert, label: named }: InsertFieldMenuProps) {
  const { t } = useI18n();
  const label = named ?? t('chips.insert');
  return (
    <FieldMenuButton
      chips={chips}
      trigger={{
        label: <IconPlus />,
        ariaLabel: label,
        tooltip: label,
        className: INSERT_TRIGGER,
      }}
      onPick={onInsert}
    />
  );
}
