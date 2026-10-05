// How an image fills its box — the `fit` picker an image ITEM and an image table
// COLUMN share (the engine's one `ImageFit` enum serves both). Each option names
// its result in words and draws it: a frame with the picture inside, filling it,
// stretched across it, or at its own size. Picking is safe, typing is not — and a
// word like "cover" does not say whether the edges are cut.
//
// The empty row is the engine default (`contain`) said out loud, and picking it
// clears the key. `cover` and `none` are offered only where the engine declares
// them (`image.fit.cover_none`); one already authored still shows by name, marked
// as not drawn by this engine.

import { useI18n } from '../i18n/context';
import { FIELD_LABEL } from '../ui/chrome';
import { Select, type SelectOption } from '../ui/Select';
import { hasCapability } from './itemPanelProps';

/** The capability that admits `cover` and `none`. */
export const FIT_COVER_NONE_CAPABILITY = 'image.fit.cover_none';

type FitMode = 'contain' | 'cover' | 'stretch' | 'none';

const ALL_MODES: readonly FitMode[] = ['contain', 'cover', 'stretch', 'none'];
const BASE_MODES: readonly FitMode[] = ['contain', 'stretch'];

/** The picture's rectangle per mode, inside a 26×18 frame at (1,1). */
const PICTURE: Readonly<Record<FitMode, readonly [number, number, number, number]>> = {
  contain: [7, 3, 14, 14],
  cover: [1, 1, 26, 18],
  stretch: [1, 1, 26, 18],
  none: [10, 7, 8, 6],
};

function FitGlyph({ mode }: { readonly mode: FitMode }) {
  const [x, y, w, h] = PICTURE[mode];
  return (
    <svg width="28" height="20" viewBox="0 0 28 20" aria-hidden="true" className="shrink-0">
      <rect x={x} y={y} width={w} height={h} className="fill-accent opacity-50" />
      <rect x="1" y="1" width="26" height="18" className="fill-none stroke-current" />
      {mode === 'stretch' ? (
        <path d="M5 10h18M8 7l-3 3 3 3M20 7l3 3-3 3" className="fill-none stroke-current" />
      ) : null}
    </svg>
  );
}

export interface FitFieldProps {
  /** The authored `fit` ('' when unset). */
  readonly value: string;
  readonly capabilities: readonly string[] | undefined;
  /** The picked wire value; '' = back to the default (clear the key). */
  readonly onCommit: (value: string) => void;
}

export function FitField({ value, capabilities, onCommit }: FitFieldProps) {
  const { t } = useI18n();
  const modes = hasCapability(capabilities, FIT_COVER_NONE_CAPABILITY) ? ALL_MODES : BASE_MODES;
  const option = (mode: FitMode, label: string): SelectOption => ({
    value: mode,
    label,
    icon: <FitGlyph mode={mode} />,
  });
  const options: SelectOption[] = [
    { value: '', label: t('panel.fit.default') },
    ...modes.map((mode) => option(mode, t(`panel.fit.${mode}`))),
  ];
  // A mode the document already has but this engine does not draw keeps its
  // name, and says so rather than reading as a raw spelling.
  const authored = ALL_MODES.find((mode) => mode === value && !modes.includes(mode));
  if (authored !== undefined) {
    options.push(
      option(authored, t('panel.fit.unsupported', { mode: t(`panel.fit.${authored}`) })),
    );
  }
  return (
    <div className="mb-2 flex flex-col gap-1">
      <span className={FIELD_LABEL}>{t('panel.field.fit')}</span>
      <Select value={value} options={options} onChange={onCommit} label={t('panel.field.fit')} />
    </div>
  );
}
