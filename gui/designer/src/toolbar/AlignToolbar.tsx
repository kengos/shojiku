// The align/distribute cluster (GU18): a selection-context icon-button group
// on the slim toolbar's rail, shown only when the canvas multi-selection holds
// at least two movable items (`MIN_ALIGN`). Six edge/center align actions plus
// two equal-gap distribute actions (enabled at `MIN_DISTRIBUTE`), each a plain
// existing op batch the Designer applies as ONE undo step — this component is
// presentational, it emits intents. gdoc-parity chrome: icon buttons with
// instant TipBubbles (via `IconButton`), thin-rule separators, one rail.

import { type AlignKind, type DistributeKind, MIN_ALIGN, MIN_DISTRIBUTE } from '../canvas/align';
import { useI18n } from '../i18n/context';
import { IconButton } from '../ui/Button';
import {
  IconObjAlignBottom,
  IconObjAlignCenterX,
  IconObjAlignLeft,
  IconObjAlignMiddleY,
  IconObjAlignRight,
  IconObjAlignTop,
  IconObjDistributeH,
  IconObjDistributeV,
} from '../ui/icons';

export interface AlignToolbarProps {
  /** How many movable items the actions would act on (the selection's movable
   * subset on the active page). Below {@link MIN_ALIGN} the cluster is hidden. */
  readonly count: number;
  readonly onAlign: (kind: AlignKind) => void;
  readonly onDistribute: (kind: DistributeKind) => void;
}

const SEP = <span className="mx-1 h-5 w-px shrink-0 bg-border" />;

/** The six align actions in the gdoc order (three horizontal, three vertical). */
const ALIGNS: readonly { kind: AlignKind; key: string; Icon: typeof IconObjAlignLeft }[] = [
  { kind: 'left', key: 'align.left', Icon: IconObjAlignLeft },
  { kind: 'centerX', key: 'align.centerX', Icon: IconObjAlignCenterX },
  { kind: 'right', key: 'align.right', Icon: IconObjAlignRight },
  { kind: 'top', key: 'align.top', Icon: IconObjAlignTop },
  { kind: 'middle', key: 'align.middle', Icon: IconObjAlignMiddleY },
  { kind: 'bottom', key: 'align.bottom', Icon: IconObjAlignBottom },
];

const DISTRIBUTES: readonly {
  kind: DistributeKind;
  key: string;
  Icon: typeof IconObjDistributeH;
}[] = [
  { kind: 'horizontal', key: 'align.distributeH', Icon: IconObjDistributeH },
  { kind: 'vertical', key: 'align.distributeV', Icon: IconObjDistributeV },
];

export function AlignToolbar({ count, onAlign, onDistribute }: AlignToolbarProps) {
  const { t } = useI18n();
  if (count < MIN_ALIGN) {
    return null;
  }
  const canDistribute = count >= MIN_DISTRIBUTE;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a toolbar-style button cluster — fieldset groups form fields, not buttons (the align-group precedent).
    <div
      className="flex shrink-0 items-center gap-1"
      role="group"
      aria-label={t('align.title')}
      data-sj-align-cluster=""
    >
      {SEP}
      <span className="shrink-0 whitespace-nowrap px-1 text-sm text-muted">
        {t('align.selected', { n: count })}
      </span>
      {ALIGNS.map(({ kind, key, Icon }) => (
        <IconButton key={kind} label={t(key)} onClick={() => onAlign(kind)}>
          <Icon />
        </IconButton>
      ))}
      {SEP}
      {DISTRIBUTES.map(({ kind, key, Icon }) => (
        <IconButton
          key={kind}
          label={t(key)}
          disabled={!canDistribute}
          onClick={() => onDistribute(kind)}
        >
          <Icon />
        </IconButton>
      ))}
    </div>
  );
}
