// The field picker's OPEN popover: the search box, the three states an offer can
// be in (nothing offered / nothing matched / rows), the pickable rows themselves
// — label, key, localized type, live sample, scope badge — and the workshop mode
// create-field tail. Pure over its props; the offer derivation and what a pick
// COMMITS live in `FieldPicker.tsx`.

import { Fragment } from 'react';
import { useI18n } from '../i18n/context';
import { TYPE_LABEL_KEYS } from '../palette/paletteRow';
import { PICKER_POPOVER, PICKER_ROW } from '../ui/chrome';
import type { PickerOption } from './pickerModel';

/** The scope badge inside a popover row: muted, since it is one attribute of the
 * offer (the closed control's accent badge says what the binding IS). */
const SCOPE_BADGE_ROW =
  'rounded-full border px-1.5 text-xs whitespace-nowrap ml-auto border-border text-muted';

const SECTION_HEADING = 'm-0 px-2 pt-1.5 pb-0.5 font-semibold text-muted text-xs tracking-wide';

/** One labeled group of offered rows. `heading` is null for a single unlabeled
 * list; `doc` marks the DOCUMENT-scope section (badge + the scope a pick from it
 * commits). */
export interface PickerSection {
  readonly id: string;
  readonly heading: string | null;
  readonly rows: readonly PickerOption[];
  readonly doc: boolean;
}

export interface PickerPopoverProps {
  readonly query: string;
  readonly onQuery: (query: string) => void;
  /** How many rows were offered BEFORE the search filter — an empty offer reads
   * as "no fields" rather than as a query that matched nothing. */
  readonly offered: number;
  readonly sections: readonly PickerSection[];
  /** The picked ROW itself, not just its key: every consumer needs the row's
   * label/sample anyway, and handing back a key made each of them look it
   * back up through a lookup that could not fail. */
  readonly onPickRow: (option: PickerOption, documentScoped: boolean) => void;
  /** The create-data-field tail; absent = no tail. */
  readonly onCreate?: () => void;
}

export function PickerPopover({
  query,
  onQuery,
  offered,
  sections,
  onPickRow,
  onCreate,
}: PickerPopoverProps) {
  const { t } = useI18n();
  return (
    <div role="menu" className={PICKER_POPOVER}>
      <input
        type="search"
        className="mb-1 w-full"
        aria-label={t('picker.search')}
        placeholder={t('picker.search')}
        value={query}
        onChange={(event) => onQuery(event.target.value)}
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
            {section.heading === null ? null : <p className={SECTION_HEADING}>{section.heading}</p>}
            {section.rows.map((option) => {
              const typeLabelKey = TYPE_LABEL_KEYS.get(option.type);
              return (
                <button
                  key={`${section.id}:${option.key}`}
                  type="button"
                  role="menuitem"
                  className={PICKER_ROW}
                  onClick={() => onPickRow(option, section.doc)}
                >
                  <span className="font-semibold">{option.label}</span>
                  {/* Wraps as a whole rather than breaking the type label
                      mid-word: the badge takes the right edge, and a long
                      dotted key leaves the narrow panel little room. */}
                  <span className="flex flex-wrap items-baseline gap-2 text-sm text-muted">
                    <code>{option.key}</code>
                    <span className="whitespace-nowrap">
                      {typeLabelKey !== undefined ? t(typeLabelKey) : option.type}
                    </span>
                    {section.doc ? (
                      <span className={SCOPE_BADGE_ROW}>{t('picker.scope.document')}</span>
                    ) : null}
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
      {onCreate !== undefined ? (
        <button
          type="button"
          role="menuitem"
          className={`${PICKER_ROW} border-border border-t font-semibold`}
          onClick={onCreate}
        >
          {t('field.create.tail')}
        </button>
      ) : null}
    </div>
  );
}
