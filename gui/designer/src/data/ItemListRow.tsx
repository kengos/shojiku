// One row of the data-item list: the field's label, key and type, plus the
// a used/unused chip counting its placements in the template.
//
// The help affordance is a SIBLING of the select button, never nested inside it
// (a button-in-button is invalid HTML), so a field carrying a description stays
// selectable and its description separately revealable.

import { HelpHint } from '../help/HelpHint';
import { useI18n } from '../i18n/context';
import type { PaletteField } from '../palette/model';
import { TYPE_LABEL_KEYS } from '../palette/paletteRow';

/** One row in the left data-item list. */
export function ListRow({
  field,
  usedCount,
  active,
  onSelect,
}: {
  readonly field: PaletteField;
  readonly usedCount: number;
  readonly active: boolean;
  readonly onSelect: () => void;
}) {
  const { t } = useI18n();
  const typeKey = TYPE_LABEL_KEYS.get(field.type);
  // The help affordance is a SIBLING of the select button, never nested inside
  // it (a button-in-button is invalid HTML).
  return (
    <li className="flex items-start gap-1">
      <button
        type="button"
        aria-current={active}
        className={`flex min-w-0 flex-1 items-start gap-2 rounded-md border-0 px-2 py-1 text-left ${
          active ? 'bg-bg' : 'bg-transparent hover:bg-bg'
        }`}
        onClick={onSelect}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold [overflow-wrap:anywhere]">{field.label}</span>
          <span className="flex items-baseline gap-2 text-sm text-muted">
            <code className="text-sm">{field.key}</code>
            <span>{typeKey !== undefined ? t(typeKey) : field.type}</span>
          </span>
        </span>
        <span className={`shrink-0 text-sm ${usedCount > 0 ? 'text-accent' : 'text-muted'}`}>
          {usedCount > 0 ? t('palette.used', { count: usedCount }) : t('palette.unused')}
        </span>
      </button>
      {field.description !== '' ? (
        <HelpHint label={t('data.field.description')} body={field.description} />
      ) : null}
    </li>
  );
}
