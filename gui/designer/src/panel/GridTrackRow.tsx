// One entry of a grid's column-width / row-height list: its kind — fit the
// content, a share of the space left over, or a fixed length — and, for a share
// or a fixed length, the number. The kind is PICKED (a dropdown); only the number
// is typed. A kind the engine cannot read is left out of the dropdown, except
// the entry's own kind, which always stays pickable so an authored value is
// never shown as something else. The value input is uncontrolled and commits on
// blur with a changed-guard and a reseed nonce (the panel-wide free-text posture);
// a refused value snaps back.

import { useI18n } from '../i18n/context';
import { Select } from '../ui/Select';
import type { Track, TrackAxis, TrackKind } from './gridTracks';
import { useReseedKey } from './useReseedKey';

const KINDS: readonly TrackKind[] = ['auto', 'fr', 'fixed'];

function ValueInput({
  label,
  track,
  onCommit,
}: {
  readonly label: string;
  readonly track: Track;
  readonly onCommit: (raw: string) => void;
}) {
  const [inputKey, reseed] = useReseedKey(track.value);
  return (
    <input
      key={inputKey}
      type="text"
      inputMode="decimal"
      aria-label={label}
      className="w-12 rounded-md border border-border bg-surface px-1.5 py-1 text-sm text-text"
      defaultValue={track.value}
      onBlur={(event) => {
        if (event.currentTarget.value !== track.value) {
          onCommit(event.currentTarget.value);
          reseed();
        }
      }}
    />
  );
}

export function GridTrackRow({
  axis,
  index,
  track,
  offered,
  onKind,
  onValue,
}: {
  readonly axis: TrackAxis;
  readonly index: number;
  readonly track: Track;
  /** The kinds the engine accepts (the entry's own kind is always shown). */
  readonly offered: ReadonlySet<TrackKind>;
  readonly onKind: (kind: TrackKind) => void;
  readonly onValue: (raw: string) => void;
}) {
  const { t } = useI18n();
  const name = t(`panel.layout.track.${axis}`, { n: index + 1 });
  const options = KINDS.filter((kind) => kind === track.kind || offered.has(kind)).map((kind) => ({
    value: kind,
    label: t(`panel.layout.track.kind.${kind}`),
  }));
  return (
    <div className="mb-1 flex items-center gap-1.5">
      {/* The number alone: the panel is narrow, and the dropdown and the input
          carry the full name ("列 2") as their accessible names. */}
      <span aria-hidden="true" className="w-4 shrink-0 text-right text-[11px] text-muted">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <Select
          label={name}
          value={track.kind}
          options={options}
          onChange={(value) => {
            if (value !== track.kind) {
              onKind(value as TrackKind);
            }
          }}
        />
      </div>
      {track.kind === 'auto' ? null : (
        <ValueInput
          label={t(
            track.kind === 'fr'
              ? 'panel.layout.track.value.fr'
              : `panel.layout.track.value.fixed.${axis}`,
            { name },
          )}
          track={track}
          onCommit={onValue}
        />
      )}
    </div>
  );
}
