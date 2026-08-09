// One GUI-derived advisory row. These are NOT engine diagnostics: the engine
// owns the `code` namespace (append-only frozen contract) and is deliberately
// silent about legal-but-probably-unintended layout, so an advisory renders
// from CHROME keys instead and wears its own badge — a reader must be able to
// tell what the engine said from what the Designer noticed.
//
// The row selects the FIRST of the two items (document order), matching how a
// diagnostic row selects its `path`; the other item is one canvas click away.

import { useI18n } from '../i18n/context';
import type { TextCollision } from './collisions';

const ROW = 'flex min-w-0 flex-1 items-baseline gap-2 text-left';

export function AdvisoryRow({
  collision,
  onSelect,
}: {
  readonly collision: TextCollision;
  readonly onSelect: (path: string) => void;
}) {
  const { t } = useI18n();
  return (
    <li className="flex items-baseline gap-2">
      <button
        type="button"
        className={`${ROW} cursor-pointer rounded-md border-0 bg-transparent px-1 py-0.5 hover:bg-bg`}
        onClick={() => onSelect(collision.a.path)}
      >
        {/* Filled accent, deliberately NOT the `info` severity's outline: an
            engine diagnostic and a Designer reading sit in the same list, so
            the badge has to separate them by more than its wording. */}
        <span className="shrink-0 rounded-full bg-accent px-2 font-semibold text-on-accent">
          {t('diagnostics.advisory')}
        </span>
        <span className="text-text">
          {t('diagnostics.textCollision', {
            a: collision.a.label,
            b: collision.b.label,
            page: collision.page + 1,
          })}
        </span>
      </button>
    </li>
  );
}
