// The line UNDER the closed field picker: the binding's scope badge, and what
// the bound key IS. Split out of `FieldPicker.tsx`, which was at the line
// budget and owns the control itself — this is the annotation beneath it, with
// its own props and its own dependency on the palette's type labels.
//
// Both facts sit here rather than in the control's row because that row is now
// ONE control: the input and its ▼ share a border, and neither a rounded accent
// pill nor a three-part description can be flush against either of them.

import { useI18n } from '../i18n/context';
import { TYPE_LABEL_KEYS } from '../palette/paletteRow';
import type { PickerOption } from './pickerModel';

/** The scope badge on the CLOSED control: accent, because it reports the state
 * this binding is actually in (the popover's per-row badge is muted). */
const SCOPE_BADGE_ON =
  'rounded-full border px-1.5 text-xs whitespace-nowrap shrink-0 border-accent text-accent';

/** What the bound key IS, under the closed control: the same three facts the
 * popover row carries (name, type, live sample). The key alone reads as a
 * spelling nobody can check — `customer.name` says nothing about which field
 * that is or what it will print. Absent for a key no offer matches: an
 * undeclared key is exactly what the live diagnostic is for.
 *
 * The name wears the chip editor's own pill (`sj-chip`), because it IS the same
 * thing: a text item shows 「お客様名」 in a pill while a bound item showed the raw
 * `customer.name`, so one binding was named two ways across the content modes. */
export function BoundField({
  option,
  documentScoped,
}: {
  option: PickerOption | undefined;
  documentScoped: boolean;
}) {
  const { t } = useI18n();
  const typeLabelKey = option === undefined ? undefined : TYPE_LABEL_KEYS.get(option.type);
  return (
    <p className="m-0 -ml-px mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-muted">
      {/* The scope badge belongs on THIS line, not wedged between the input and
          its ▼: those two are one control now and share one border, and a
          rounded accent pill cannot sit flush against either. It reports what
          the binding IS, which is the same kind of fact as the rest of the row. */}
      {documentScoped ? <span className={SCOPE_BADGE_ON}>{t('picker.scope.document')}</span> : null}
      {option === undefined ? null : (
        <>
          <span className="sj-chip">
            <span className="sj-chip-label">{option.label}</span>
          </span>
          {/* Separated, not just spaced: read cold, `[今回納品数] 数量 61` looks like
          one run of text whose pill stops halfway. The dot is the same one the
          origin badge uses to list a value's attributes. */}
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap">
            {typeLabelKey === undefined ? option.type : t(typeLabelKey)}
          </span>
          {option.sample === '' ? null : (
            <>
              <span aria-hidden="true">·</span>
              <span className="min-w-0 truncate italic">{option.sample}</span>
            </>
          )}
        </>
      )}
    </p>
  );
}
