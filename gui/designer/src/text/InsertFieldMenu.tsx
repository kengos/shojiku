// The chip editor's insert-a-field control: a button opening a popover of the
// binding picker's rows (label / key / localized type / live sample — the same
// pure option model the `data.key` picker uses), search-filterable.
//
// What it offers depends on what the connected engine can express. Against an
// engine that understands `bindings:`, EVERY field is offerable — a key outside
// the interpolation charset gets a declared name, and a row-scoped item gains a
// second section of document-scope fields the bare `{key}` grammar could never
// reach into a cell. Against an older one the menu keeps the charset filter and
// shows no second section, because the declaration it would need is a parse
// error there. Picking a row only reports WHICH field was picked and from which
// section; how that becomes wire is the pure `planChipInsert`'s call.

import { Fragment, useState } from 'react';
import { usePopover } from '../hooks/usePopover';
import { useI18n } from '../i18n/context';
import { TYPE_LABEL_KEYS } from '../palette/paletteRow';
import { filterOptions, type PickerOption } from '../panel/pickerModel';
import { PICKER_POPOVER, PICKER_ROW } from '../ui/chrome';
import type { ChipContext } from './chipContext';
import { chipWire } from './chipModel';

export interface InsertFieldMenuProps {
  readonly chips: ChipContext;
  /** Insert a chip for the picked field. `documentScoped` marks a row from the
   * document-data section, the pick the declaration exists for. */
  readonly onInsert: (option: PickerOption, documentScoped: boolean) => void;
}

export function InsertFieldMenu({ chips, onInsert }: InsertFieldMenuProps) {
  const { t } = useI18n();
  const { open, setOpen, rootRef } = usePopover();
  const [query, setQuery] = useState('');
  const { options, documentOptions, scope, canDeclare } = chips;
  const rowScoped = scope !== null;
  // Without declarations a charset-unsafe key would degrade to literal braces
  // on the page, so it is not a pickable chip there. Offerability is settled
  // BEFORE the search filter, so a set this rule empties reads as "no fields"
  // rather than as a query that matched nothing.
  const offerable = options.filter((option) => canDeclare || chipWire(option.key) !== null);
  const documentOffered = rowScoped && canDeclare ? documentOptions : [];
  const ambientRows = filterOptions(offerable, query);
  const documentRows = filterOptions(documentOffered, query);
  const offered = offerable.length + documentOffered.length;
  const sections = [
    {
      id: 'row',
      heading: rowScoped ? t('chips.section.row') : null,
      rows: ambientRows,
      doc: false,
    },
    { id: 'document', heading: t('chips.section.document'), rows: documentRows, doc: true },
  ].filter((section) => section.rows.length > 0);
  return (
    <div className="relative mt-1" ref={rootRef}>
      <button
        type="button"
        className="cursor-pointer rounded-md border border-border bg-chrome px-2 text-sm text-text"
        aria-haspopup="menu"
        aria-expanded={open}
        // The property panel wraps the editor in a `<label>`, whose text would
        // otherwise become this button's accessible name — leaving two "Text"
        // controls in one field. The explicit name is its own visible text, so
        // it also stays reachable by voice control (WCAG label-in-name).
        aria-label={t('chips.insert')}
        onClick={() => setOpen((v) => !v)}
      >
        {t('chips.insert')}
      </button>
      {open ? (
        <div role="menu" className={PICKER_POPOVER}>
          <input
            type="search"
            className="mb-1 w-full"
            aria-label={t('picker.search')}
            placeholder={t('picker.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {offered === 0 ? (
            <p className="m-0 px-2 py-1 text-sm text-muted">{t('picker.empty')}</p>
          ) : sections.length === 0 ? (
            <p className="m-0 px-2 py-1 text-sm text-muted">{t('palette.noMatches')}</p>
          ) : (
            sections.map((section) => (
              // A Fragment, not a wrapper: the popover is the flex column the
              // headings and rows are items of, and `role="menu"` takes no
              // roleless box between it and its `menuitem`s.
              <Fragment key={section.id}>
                {section.heading === null ? null : (
                  <p className="m-0 px-2 pt-1.5 pb-0.5 font-semibold text-muted text-xs tracking-wide">
                    {section.heading}
                  </p>
                )}
                {section.rows.map((option) => {
                  const typeLabelKey = TYPE_LABEL_KEYS.get(option.type);
                  return (
                    <button
                      key={`${section.id}:${option.key}`}
                      type="button"
                      role="menuitem"
                      className={PICKER_ROW}
                      onClick={() => {
                        setOpen(false);
                        setQuery('');
                        onInsert(option, section.doc);
                      }}
                    >
                      <span className="font-semibold">{option.label}</span>
                      <span className="flex items-baseline gap-2 text-sm text-muted">
                        <code>{option.key}</code>
                        <span>{typeLabelKey !== undefined ? t(typeLabelKey) : option.type}</span>
                      </span>
                      {option.sample !== '' ? (
                        <span className="sj-field-picker-sample text-sm text-muted italic [overflow-wrap:anywhere]">
                          {option.sample}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </Fragment>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
