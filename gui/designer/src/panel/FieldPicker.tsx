// The binding field picker: the property panel's `data.key` editor. The free
// text input keeps the existing semantics (commit-on-blur on a CHANGED value,
// an empty key stays present so the validation warning surfaces), and a
// popover offers the pickable fields — label, key, localized type, live
// sample value — from the pure picker model; picking one commits ONE op.
// Picking is safe, typing is dangerous: picking is the primary path, typing stays
// possible for a key the definitions don't (yet) declare.
//
// Inside a row scope (a table column, a repeat cell, a repeat_flow card) the
// popover splits in two: the row's own fields, and — when the engine
// understands `binding.scope` — the DOCUMENT-scope fields, which resolve
// against top-level params rather than the row. A document pick authors the
// `scope: document` that makes it so; the closed control keeps a badge, so
// the scope of an already-authored binding is readable without opening.
//
// This file owns the closed CONTROL (free-text input, scope badge, toggle), the
// offer derivation and what a pick commits; the open popover is
// `PickerPopover.tsx`.

import { useState } from 'react';
import { usePopover } from '../hooks/usePopover';
import { useI18n } from '../i18n/context';
import { TYPE_LABEL_KEYS } from '../palette/paletteRow';
import { IconChevronDown } from '../ui/icons';
import { Field } from './fields';
import { DOCUMENT_SCOPE } from './model';
import { PickerPopover } from './PickerPopover';
import { filterOptions, type PickerOption } from './pickerModel';

/** The scope badge on the CLOSED control: accent, because it reports the state
 * this binding is actually in (the popover's per-row badge is muted). */
const SCOPE_BADGE_ON =
  'rounded-full border px-1.5 text-xs whitespace-nowrap shrink-0 border-accent text-accent';

const NO_OPTIONS: readonly PickerOption[] = [];

/** What the bound key IS, under the closed control: the same three facts the
 * popover row carries (name, type, live sample). The key alone reads as a
 * spelling nobody can check — `customer.name` says nothing about which field
 * that is or what it will print. Absent for a key no offer matches: an
 * undeclared key is exactly what the live diagnostic is for. */
function BoundField({ option }: { option: PickerOption }) {
  const { t } = useI18n();
  const typeLabelKey = TYPE_LABEL_KEYS.get(option.type);
  return (
    <p className="m-0 mb-2 flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm text-muted">
      <span className="font-semibold text-text">{option.label}</span>
      <span className="whitespace-nowrap">
        {typeLabelKey === undefined ? option.type : t(typeLabelKey)}
      </span>
      {option.sample === '' ? null : (
        <span className="min-w-0 truncate italic">{option.sample}</span>
      )}
    </p>
  );
}

export interface FieldPickerProps {
  readonly label: string;
  /** The current `data.key` value. */
  readonly value: string;
  readonly options: readonly PickerOption[];
  /** Commit a key (a picked option's, or free-typed text). Typing NEVER
   * re-scopes the binding — the key changes and `data.scope` stays as the
   * file has it. */
  readonly onCommit: (key: string) => void;
  /** The DOCUMENT-scope rows, offered as a labeled second section. The caller
   * passes them only inside a row scope AND with `binding.scope` available —
   * empty/absent keeps today's single unlabeled list. */
  readonly documentOptions?: readonly PickerOption[];
  /** The binding's authored `data.scope`, passed only where a scope is
   * meaningful (inside a row scope); `document` renders the badge. Reading is
   * unconditional — an externally authored escape shows its badge even
   * against an engine that could not author it. Absent reads as unset, which
   * is what every caller that offers no scope choice means (they pass this
   * and `onPick` together or not at all). */
  readonly scope?: string;
  /** Commit a PICKED row together with the scope it was offered at: `true`
   * for the document section, `false` for the row's own fields. Absent = this
   * picker offers no scope choice, so a pick commits through `onCommit` and
   * leaves `data.scope` untouched. */
  readonly onPick?: (key: string, documentScoped: boolean) => void;
  /** workshop mode, document-scope only: open the create-data-field modal.
   * The picker hands its own commit up so a created field binds THIS item.
   * Absent = no tail (an engineer schema, or a row-scoped picker). */
  readonly onCreateField?: (bindKey: (key: string) => void) => void;
}

export function FieldPicker({
  label,
  value,
  options,
  onCommit,
  documentOptions = NO_OPTIONS,
  scope = '',
  onPick,
  onCreateField,
}: FieldPickerProps) {
  const { t } = useI18n();
  const { open, setOpen, rootRef } = usePopover();
  const [query, setQuery] = useState('');
  // Offerability is settled BEFORE the search filter, so an empty offer reads
  // as "no fields" rather than as a query that matched nothing.
  const offered = options.length + documentOptions.length;
  // Headings earn their space only when there are two offers to tell apart. A
  // single list keeps today's bare popover — including the source picker,
  // whose only offers ARE document-scope ones (their badge says so per row).
  const split = options.length > 0 && documentOptions.length > 0;
  const sections = [
    {
      id: 'row',
      heading: split ? t('chips.section.row') : null,
      rows: filterOptions(options, query),
      doc: false,
    },
    {
      id: 'document',
      heading: split ? t('chips.section.document') : null,
      rows: filterOptions(documentOptions, query),
      doc: true,
    },
  ].filter((section) => section.rows.length > 0);
  const bound = [...options, ...documentOptions].find((option) => option.key === value);
  const commitPick = (key: string, documentScoped: boolean) => {
    setOpen(false);
    setQuery('');
    if (onPick === undefined) {
      if (key !== value) {
        onCommit(key);
      }
      return;
    }
    // The same no-op guard the free-entry commit has always had, extended to
    // the SECOND thing a pick can change: re-picking the row already bound
    // authors nothing (and mints no undo step), while picking the same key
    // from the OTHER section still moves the scope.
    if (key !== value || (documentScoped ? DOCUMENT_SCOPE : '') !== scope) {
      onPick(key, documentScoped);
    }
  };
  return (
    <div className="relative" ref={rootRef}>
      <span className="flex min-w-0 items-end gap-1">
        <span className="min-w-0 flex-1">
          <Field label={label}>
            {/* `w-full` keeps the input inside its shrunken flex cell: an
                unsized input takes its default ~20ch and overflows the cell,
                which now runs under the scope badge beside it. */}
            <input
              key={value}
              type="text"
              className="w-full"
              defaultValue={value}
              onBlur={(event) => {
                if (event.currentTarget.value !== value) {
                  onCommit(event.currentTarget.value);
                }
              }}
            />
          </Field>
        </span>
        {scope === DOCUMENT_SCOPE ? (
          <span className={SCOPE_BADGE_ON}>{t('picker.scope.document')}</span>
        ) : null}
        <button
          type="button"
          className="shrink-0 cursor-pointer rounded-md border border-border bg-chrome px-2 text-text"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t('picker.open')}
          onClick={() => setOpen((v) => !v)}
        >
          <IconChevronDown size={12} className="text-muted" />
        </button>
      </span>
      {bound === undefined ? null : <BoundField option={bound} />}
      {open ? (
        <PickerPopover
          query={query}
          onQuery={setQuery}
          offered={offered}
          sections={sections}
          onPickRow={commitPick}
          onCreate={
            onCreateField === undefined
              ? undefined
              : () => {
                  setOpen(false);
                  setQuery('');
                  onCreateField(onCommit);
                }
          }
        />
      ) : null}
    </div>
  );
}
