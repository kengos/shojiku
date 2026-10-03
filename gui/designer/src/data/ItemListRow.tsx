// One row of the data-item tree: the node's label over its data name and type
// (a container shows its kind instead), the 必須 chip, and the used/unused chip
// counting its placements in the template.
//
// A container row carries its OWN ▸/▾ toggle beside the select button, so opening
// a group never changes the selection and selecting one never folds it. The help
// affordance is likewise a SIBLING of the select button, never nested inside it
// (a button-in-button is invalid HTML), so a field carrying a description stays
// selectable and its description separately revealable.

import { HelpHint } from '../help/HelpHint';
import { useI18n } from '../i18n/context';
import { TYPE_LABEL_KEYS } from '../palette/paletteRow';
import { IconChevronDown } from '../ui/icons';
import type { DefsNode } from './defsTree';
import { nodeLabel } from './treeModel';

export interface ListRowProps {
  readonly node: DefsNode;
  readonly depth: number;
  /** `null` = the node has no usage of its own (a group). */
  readonly usedCount: number | null;
  readonly active: boolean;
  /** `null` = nothing to open (a field, a list, an empty container). */
  readonly expanded: boolean | null;
  readonly onToggle: () => void;
  readonly onSelect: () => void;
}

function TypeText({ node }: { readonly node: DefsNode }) {
  const { t } = useI18n();
  let type: string;
  if (node.leaf === null) {
    type = t(`data.kind.${node.kind}`);
  } else {
    const typeKey = TYPE_LABEL_KEYS.get(node.leaf.type);
    type = typeKey !== undefined ? t(typeKey) : node.leaf.type;
  }
  // A field (or a list's element) limited to choices says so beside its type.
  return (
    <span>
      {node.choices ? t('data.typeWithChoices', { type, choices: t('data.choices.title') }) : type}
    </span>
  );
}

/** One row in the left data-item tree. */
export function ListRow({
  node,
  depth,
  usedCount,
  active,
  expanded,
  onToggle,
  onSelect,
}: ListRowProps) {
  const { t } = useI18n();
  const label = nodeLabel(node);
  const description = node.leaf?.description ?? '';
  return (
    <div className="flex items-start gap-1" style={{ paddingLeft: `${depth}rem` }}>
      {expanded === null ? (
        <span className="w-5 shrink-0" aria-hidden="true" />
      ) : (
        <button
          type="button"
          className="flex h-6 w-5 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-muted"
          aria-expanded={expanded}
          aria-label={t('data.tree.toggle', { label })}
          onClick={onToggle}
        >
          {/* The shipped disclosure pattern (the layer tree's): one chevron,
              rotated a quarter turn when folded; `data-collapsed` is the hook. */}
          <IconChevronDown
            size={12}
            data-collapsed={expanded ? undefined : ''}
            className="transition-transform data-collapsed:-rotate-90"
          />
        </button>
      )}
      <button
        type="button"
        aria-current={active}
        className={`flex min-w-0 flex-1 items-start gap-2 rounded-md border-0 px-2 py-1 text-left ${
          active ? 'bg-bg' : 'bg-transparent hover:bg-bg'
        }`}
        onClick={onSelect}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold [overflow-wrap:anywhere]">{label}</span>
          <span className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted">
            <code className="text-sm">{node.name}</code>
            <TypeText node={node} />
            {node.required ? <span className="text-accent">{t('data.required')}</span> : null}
          </span>
        </span>
        {usedCount === null ? null : (
          <span className={`shrink-0 text-sm ${usedCount > 0 ? 'text-accent' : 'text-muted'}`}>
            {usedCount > 0 ? t('palette.used', { count: usedCount }) : t('palette.unused')}
          </span>
        )}
      </button>
      {description !== '' ? (
        <HelpHint label={t('data.field.description')} body={description} />
      ) : null}
    </div>
  );
}
