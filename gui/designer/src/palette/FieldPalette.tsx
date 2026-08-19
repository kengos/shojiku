// The Field Palette: the PM's read-only view of the engineer's
// `definitions.yml` — a grouped, searchable side panel of every data field
// (label, key, type, description, sample) with a used-in-template indicator
// correlated against the template's bindings (`data.key` AND `{key}`
// interpolations — the one usage walk). Clicking a used field selects a bound
// item's path (reusing the ONE selection state, like the diagnostics panel),
// and repeated clicks cycle through all its placements. With the optional
// `drag` wiring, document-scope fields drag onto the canvas to create a bound
// item, and an array GROUP's heading drags to drop its default iterable
// scaffold (the Designer owns the pointer state machine and the drop); the
// palette itself still dispatches NO document ops. Fields INSIDE an array
// group drag too, carrying their group id — a row-relative key resolves only
// inside a cell fed by that same group, and the drop planner refuses (paints
// nothing, does nothing) everywhere else.

import { useMemo, useState } from 'react';
import { HelpHint } from '../help/HelpHint';
import { useI18n } from '../i18n/context';
import { TOUR_ANCHORS } from '../tutorial/anchors';
import { IconButton } from '../ui/Button';
import { INPUT, SECTION_TITLE } from '../ui/chrome';
import { IconGear } from '../ui/icons';
import { readBindings } from './bindings';
import { filterGroups } from './filter';
import type { FieldTarget } from './model';
import { readDefinitionsView, rowScopeLabel } from './model';
import { GroupSection } from './paletteGroup';
import type { PaletteDrag } from './paletteRow';
import { buildUsage } from './usage';

export type { PaletteDrag };

export interface FieldPaletteProps {
  /** The definitions YAML text (read-only; the engineer's schema). */
  readonly definitions: string;
  /** The current template YAML text the usage correlation reads. */
  readonly templateText: string;
  /** Selects a path on canvas — the shared selection state. */
  readonly onSelect: (path: string) => void;
  /** Drag-to-bind wiring (document-scope fields only); absent = click-only. */
  readonly drag?: PaletteDrag;
  /** Open the fullscreen data-item editor (definitions + sample) — the gear in
   * this tab's header. Absent = no gear (a host without the editor). */
  readonly onOpenEditor?: () => void;
  /** Open that editor ALREADY on one field — the per-row gear. Kept separate
   * from `onOpenEditor`, which is wired straight to a click handler and would
   * otherwise receive the MouseEvent where a target belongs. Absent = no
   * per-row gears. */
  readonly onOpenField?: (target: FieldTarget) => void;
}

export function FieldPalette({
  definitions,
  templateText,
  onSelect,
  drag,
  onOpenEditor,
  onOpenField,
}: FieldPaletteProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  // Repeated clicks on the same field cycle through its placements; clicking
  // a different field restarts at the first one.
  const [cycle, setCycle] = useState<{ id: string; index: number } | null>(null);
  const groups = useMemo(() => readDefinitionsView(definitions), [definitions]);
  const usage = useMemo(() => buildUsage(readBindings(templateText)), [templateText]);
  const shown = useMemo(() => filterGroups(groups ?? [], query), [groups, query]);

  const pick = (id: string, paths: readonly string[]) => {
    const index = cycle !== null && cycle.id === id ? (cycle.index + 1) % paths.length : 0;
    setCycle({ id, index });
    onSelect(paths[index]);
  };

  return (
    <section className="min-w-0 p-3" aria-label={t('palette.title')}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <h2 className={`${SECTION_TITLE} mb-0`}>{t('palette.title')}</h2>
          {/* One hint for the whole list rather than a label per part: the row
            is ~215px and does not fit a second text element beside the name. */}
          <HelpHint
            label={t('help.dataFields.title')}
            title={t('help.dataFields.title')}
            body={t('help.dataFields.body')}
          />
        </div>
        {onOpenEditor !== undefined ? (
          <span data-tour={TOUR_ANCHORS.dataEditorGear}>
            <IconButton label={t('data.gear')} variant="ghost" onClick={onOpenEditor}>
              <IconGear />
            </IconButton>
          </span>
        ) : null}
      </div>
      <input
        type="search"
        className={`${INPUT} mb-3`}
        aria-label={t('palette.search')}
        placeholder={t('palette.search')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {groups === null || groups.length === 0 ? (
        <p className="m-0 text-muted">{t('palette.empty')}</p>
      ) : shown.length === 0 ? (
        <p className="m-0 text-muted">{t('palette.noMatches')}</p>
      ) : (
        shown.map((group) => (
          <GroupSection
            key={group.id}
            group={group}
            usage={usage}
            onPick={pick}
            drag={drag}
            onEditField={
              onOpenField === undefined ? undefined : (key) => onOpenField({ group: group.id, key })
            }
            parentLabel={rowScopeLabel(groups, group)}
          />
        ))
      )}
    </section>
  );
}
