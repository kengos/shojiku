// The ancestor breadcrumb above the canvas: the selected node's chain from
// its section down, each crumb a button that moves the shared selection to
// that ancestor — the escape hatch out of a deep selection (a table cell back
// to its table). The bar keeps its height when nothing is selected, so
// selecting never shifts the canvas below it.

import { useI18n } from '../i18n/context';
import { nodeLabel } from './labels';
import type { TreeView } from './model';
import { breadcrumbChain } from './selection';

export interface BreadcrumbProps {
  readonly view: TreeView | null;
  readonly selection: string | null;
  readonly onSelect: (path: string) => void;
}

export function Breadcrumb({ view, selection, onSelect }: BreadcrumbProps) {
  const { t } = useI18n();
  const chain = breadcrumbChain(view, selection);
  return (
    <nav className="flex min-w-0 flex-1 items-center" aria-label={t('breadcrumb.label')}>
      {chain.length > 0 ? (
        <ol className="m-0 flex list-none flex-wrap items-center p-0">
          {chain.map((node, index) => (
            <li
              key={node.path}
              className="flex items-center before:px-1 before:text-muted before:content-['›'] first:before:hidden"
            >
              <button
                type="button"
                className="cursor-pointer rounded-md bg-transparent px-1 py-0.5 text-sm text-muted hover:bg-bg hover:text-text aria-[current=true]:font-semibold aria-[current=true]:text-text"
                aria-current={index === chain.length - 1 ? 'true' : undefined}
                onClick={() => onSelect(node.path)}
              >
                {nodeLabel(node, t)}
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </nav>
  );
}
