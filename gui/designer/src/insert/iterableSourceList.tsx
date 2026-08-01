// The iterable dialog's source picker: one radio row per bindable array group.
// Read-only over the palette's groups — it owns no document knowledge and
// hands the picked id up. Group labels/ids are definitions-derived (untrusted
// but display-capped) text rendered through React's escaping.

import { useI18n } from '../i18n/context';
import type { PaletteGroup } from '../palette/model';

interface IterableSourceListProps {
  readonly groups: readonly PaletteGroup[];
  /** The currently picked group id (may match none — nothing is then checked). */
  readonly groupId: string;
  readonly onPick: (id: string) => void;
}

export function IterableSourceList({ groups, groupId, onPick }: IterableSourceListProps) {
  const { t } = useI18n();
  return (
    <fieldset className="m-0 flex flex-col gap-1 rounded-md border border-border p-2">
      <legend className="px-1 text-sm text-muted">{t('iterable.source')}</legend>
      {groups.map((group) => (
        <label key={group.id} className="flex items-center gap-1">
          <input
            type="radio"
            name="sj-iterable-group"
            checked={group.id === groupId}
            onChange={() => onPick(group.id)}
          />
          <span>{group.label}</span>
          <code className="text-sm text-muted">{group.id}</code>
        </label>
      ))}
    </fieldset>
  );
}
