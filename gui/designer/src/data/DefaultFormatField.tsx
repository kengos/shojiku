// A field's DEFAULT display variant (`displayFormat`): what it shows as when the
// placement picks no format. The variants offered are the ENGINE's for the
// field's type (the format catalog), each with the wire spelling beside its name
// and what the engine renders for it; 「文書の表示形式に従う」 clears the key, so the
// document's own per-type setting applies.
//
// A type the engine offers no named variant for (number, percentage, quantity)
// gets no picker — every pick but the default would only warn — and shows what
// it renders instead. A type with no display variants at all (text, yes / no,
// image) shows nothing, unless a value was authored: an authored value outside
// the offered set is kept verbatim as the selected row and survives until the
// author picks another (a closed control over an open wire must not drop it).

import type { FormatCatalog } from '../engine/types';
import { usePopover } from '../hooks/usePopover';
import { useI18n } from '../i18n/context';
import { clip } from '../palette/fieldDisplay';
import { FormatOptionList } from '../panel/FormatOptionList';
import { variantLabelKey } from '../panel/formatLabels';
import {
  type FormatOption,
  isFixedType,
  variantOptions,
  variantSamples,
} from '../panel/formatModel';
import { FIELD_LABEL, PICKER_POPOVER, PICKER_ROW, PICKER_TOGGLE } from '../ui/chrome';
import { IconChevronDown } from '../ui/icons';

export interface DefaultFormatFieldProps {
  /** The field's type as the catalog names it (`datetime`, not `date-time`). */
  readonly type: string;
  readonly catalog: FormatCatalog | null;
  /** The authored `displayFormat` (empty = unset). */
  readonly current: string;
  /** The field's own declared format ids — offered too, beside the engine's. */
  readonly declared: readonly string[];
  readonly editable: boolean;
  /** Pick a spelling; empty = follow the document. */
  readonly onPick: (spelling: string) => void;
}

/** Every variant the engine offers for `type`, in the engine's order — which
 * ends with the type's own `default` (`variantOptions` leaves it out, since the
 * document-defaults rows offer it as their leading row). */
function offered(catalog: FormatCatalog | null, type: string): FormatOption[] {
  if (!(catalog?.types.some((entry) => entry.fieldType === type) ?? false)) {
    return [];
  }
  const own = catalog?.types
    .find((entry) => entry.fieldType === type)
    ?.variants.find((variant) => variant.spelling === 'default');
  const fallback: FormatOption = {
    spelling: 'default',
    labelKey: variantLabelKey('default'),
    samples: own?.samples ?? [],
    origin: own?.origin ?? 'builtin',
    dropsTime: false,
  };
  return [...variantOptions(catalog, type), fallback];
}

export function DefaultFormatField(props: DefaultFormatFieldProps) {
  const { type, catalog, current, declared, editable, onPick } = props;
  const { t } = useI18n();
  const { open, setOpen, rootRef } = usePopover();
  const label = t('data.display.defaultFormat');
  const follow = t('data.display.follow', { section: t('formats.title') });
  const engine = offered(catalog, type);
  // A declared id the engine does not list for this type is still a pick the
  // field names; it shows as written, with no sample, ahead of the engine's
  // headed groups.
  const options = [
    ...declared
      .filter((id) => !engine.some((option) => option.spelling === id))
      .map(
        (id): FormatOption => ({
          spelling: id,
          labelKey: undefined,
          samples: [],
          origin: undefined,
          dropsTime: false,
        }),
      ),
    ...engine,
  ];
  const known = options.find((option) => option.spelling === current);
  if (current === '' && (isFixedType(catalog, type) || options.length === 0)) {
    if (!isFixedType(catalog, type)) {
      return null;
    }
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className={FIELD_LABEL}>{label}</span>
        <p className="m-0 flex flex-wrap items-baseline gap-2 text-sm text-muted">
          {t('data.display.fixed')}
          <span className="italic">{variantSamples(catalog, type, 'default').join(' / ')}</span>
        </p>
      </div>
    );
  }
  let shown = follow;
  if (known !== undefined) {
    shown = known.labelKey === undefined ? known.spelling : t(known.labelKey);
  } else if (current !== '') {
    shown = clip(current);
  }
  const pick = (spelling: string) => {
    setOpen(false);
    onPick(spelling);
  };
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className={FIELD_LABEL}>{label}</span>
      <div className="relative flex items-center gap-2" ref={rootRef}>
        <span className={`min-w-0 flex-1 truncate ${current === '' ? 'text-muted' : ''}`}>
          {shown}
          {known === undefined || known.samples.length === 0 ? null : (
            <span className="ml-2 text-sm text-muted italic">{known.samples.join(' / ')}</span>
          )}
        </span>
        {editable ? (
          <button
            type="button"
            className={PICKER_TOGGLE}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={t('data.display.chooseFormat')}
            onClick={() => setOpen((was) => !was)}
          >
            <IconChevronDown size={12} className="text-muted" />
          </button>
        ) : null}
        {open ? (
          <div role="menu" className={PICKER_POPOVER}>
            <FormatOptionList
              options={options}
              leading={{ label: follow, samples: [], onPick: () => pick('') }}
              onPick={pick}
            />
            {current !== '' && known === undefined ? (
              <button
                type="button"
                role="menuitem"
                className={PICKER_ROW}
                onClick={() => pick(current)}
              >
                <code className="text-sm">{clip(current)}</code>
                <span className="text-sm text-muted">{t('data.display.authored')}</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="m-0 text-sm text-muted">
        {t('data.display.defaultFormatHint', { follow: follow })}
      </p>
    </div>
  );
}
