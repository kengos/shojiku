// One palette GROUP section: its heading (an ARRAY group's heading drags to
// drop the group's default iterable scaffold) and the field rows under it.

import { useI18n } from '../i18n/context';
import type { PaletteGroup } from './model';
import { FieldRow, type PaletteDrag, UsageBadge } from './paletteRow';
import { fieldUsage, groupUsage, type UsageIndex } from './usage';

interface GroupSectionProps {
  readonly group: PaletteGroup;
  readonly usage: UsageIndex;
  readonly onPick: (id: string, paths: readonly string[]) => void;
  readonly drag?: PaletteDrag;
  /** Open the data-item editor on one of this group's fields; absent = no gears. */
  readonly onEditField?: (key: string) => void;
  /** The display label of the group whose ROWS carry this one, when they do.
   * A nested source shows its own title like any other group, so without
   * this the reader cannot tell 「内容品」 (per order) from a top-level list
   * of the same name — and the two are bound in different scopes. */
  readonly parentLabel?: string;
}

export function GroupSection({
  group,
  usage,
  onPick,
  drag,
  onEditField,
  parentLabel,
}: GroupSectionProps) {
  const { t } = useI18n();
  const sourcePaths = groupUsage(usage, group);
  // Top-level scalar fields gather into one unlabeled group; the model keeps
  // its label empty so the localized heading stays a catalog string.
  const label = group.label === '' ? t('palette.ungrouped') : group.label;
  const heading = (
    <>
      <span>{label}</span>
      {group.isArray ? (
        <span className="rounded-full border border-border px-2 text-sm font-normal text-muted">
          {t('palette.array')}
        </span>
      ) : null}
      {parentLabel === undefined ? null : (
        <span className="rounded-full border border-border px-2 text-sm font-normal text-muted">
          {t('palette.rowScope', { group: parentLabel })}
        </span>
      )}
    </>
  );
  // An array group's HEADING drags its default scaffold onto the canvas; the
  // pointer handlers ride the h3 so both the bound (button) and unbound
  // (plain) headings arm the same drag. A `rowScope` group is bindable only
  // from inside its parent's cell, with a row-relative key, so it is shown
  // but never dragged — a scaffold from here would author a document-scope
  // source path that resolves to nothing.
  const draggableGroup = group.isArray && group.rowScope === undefined;
  const groupDragProps =
    drag === undefined || !draggableGroup
      ? {}
      : {
          onPointerDown: (event: React.PointerEvent<Element>) =>
            drag.begin({ kind: 'group', group }, event),
          onPointerMove: drag.move,
          onPointerUp: drag.up,
          onPointerCancel: drag.cancel,
        };
  const groupDraggableClass = drag !== undefined && draggableGroup ? ' cursor-grab touch-none' : '';
  return (
    <section className="mb-4" aria-label={label}>
      <h3
        className={`m-0 mb-1 flex items-center gap-2 text-sm font-semibold text-text${groupDraggableClass}`}
        {...groupDragProps}
      >
        {group.isArray && sourcePaths.length > 0 ? (
          <button
            type="button"
            className="flex cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent p-0 text-left"
            onClick={() => {
              if (drag?.consumeClick() === true) {
                return;
              }
              onPick(group.id, sourcePaths);
            }}
          >
            {heading}
            <UsageBadge count={sourcePaths.length} />
          </button>
        ) : (
          heading
        )}
      </h3>
      {group.description !== '' ? (
        <p className="m-0 mb-1 text-sm text-muted">{group.description}</p>
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-px p-0">
        {group.fields.map((field, index) => (
          <FieldRow
            // biome-ignore lint/suspicious/noArrayIndexKey: duplicate field keys are legal in a group; index disambiguates them.
            key={`${field.key}:${index}`}
            field={field}
            paths={fieldUsage(usage, group, field.key)}
            onPick={(paths) => onPick(`${group.id}#${field.key}:${index}`, paths)}
            group={group.isArray ? group.id : null}
            // An array group's field drags too, but only INTO a cell whose
            // rows come from that same group — the planner refuses the rest,
            // and a refused hover paints nothing. A row-scoped group has no
            // such cell to drop into (its own source cannot be bound at
            // document scope), so its rows alone stay display-only.
            drag={group.rowScope === undefined ? drag : undefined}
            // The row takes a bound no-arg callback: it knows nothing about
            // group ids, and the group is what can name its own field.
            onEdit={onEditField === undefined ? undefined : () => onEditField(field.key)}
          />
        ))}
      </ul>
    </section>
  );
}
