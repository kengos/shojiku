// The slim toolbar's VIEW cluster: grid step, the sample-data variant switch,
// zoom, and the template-capacity readout. Split out of `SlimToolbar` so that
// bar stays an assembly of clusters (undo/redo | view | format | align) rather
// than a flat row.
//
// Every group here owns its LEADING rule (`ui/Sep`), which is what makes the
// conditional ones safe: a variant switch or a capacity readout that does not
// render takes its rule with it, so two rules can never end up adjacent. The
// format and align clusters follow the same convention on the same rail.

import { GRID_STEPS } from '../canvas/plan';
import { ZoomControl } from '../canvas/ZoomControl';
import { HelpHint } from '../help/HelpHint';
import type { ChromeDialogs } from '../hooks/useChromeDialogs';
import type { EditorPrefs } from '../hooks/useEditorPrefs';
import type { ImageImport } from '../hooks/useImageImport';
import type { PreviewSession } from '../hooks/usePreviewSession';
import type { SampleData } from '../hooks/useSampleData';
import type { HostConfig } from '../hostConfig';
import { useI18n } from '../i18n/context';
import { TemplateSizeIndicator } from '../image/TemplateSizeIndicator';
import { VariantSelect } from '../sample/VariantSelect';
import { SELECT_SM } from '../ui/chrome';
import { Sep } from '../ui/Sep';

export interface ViewControlsProps {
  readonly prefs: EditorPrefs;
  readonly sample: SampleData;
  readonly image: ImageImport;
  readonly session: PreviewSession;
  readonly host: HostConfig;
  readonly dialogs: ChromeDialogs;
  readonly maxBytes: number;
}

export function ViewControls({
  prefs,
  sample,
  image,
  session,
  host,
  dialogs,
  maxBytes,
}: ViewControlsProps) {
  const { t } = useI18n();
  // Locals, not property reads: narrowing follows a local binding.
  const { nextCap } = image;
  const { imageCodec } = host;

  return (
    <>
      <Sep />
      <label className="flex shrink-0 items-center gap-1 text-sm text-muted">
        {t('grid.label')}
        <select
          className={SELECT_SM}
          value={String(prefs.gridStep)}
          onChange={(event) => prefs.changeGridStep(Number(event.target.value))}
        >
          <option value="0">{t('grid.off')}</option>
          {GRID_STEPS.map((step) => (
            <option key={step} value={String(step)}>
              {`${step}pt`}
            </option>
          ))}
        </select>
      </label>
      <HelpHint
        label={t('help.grid.title')}
        title={t('help.grid.title')}
        body={t('help.grid.body')}
        onMore={dialogs.openGlossary}
        moreLabel={t('help.more')}
      />
      {sample.sampleSet.variants.length > 1 ? (
        <>
          <Sep />
          <VariantSelect set={sample.sampleSet} onSwitch={sample.handleSwitch} />
        </>
      ) : null}
      <Sep />
      <ZoomControl zoom={session.zoom} onZoom={session.setZoomClamped} onFit={session.onFit} />
      {imageCodec !== undefined && image.hasImageItem ? (
        <>
          <Sep />
          <TemplateSizeIndicator
            templateBytes={image.textBytes}
            maxBytes={maxBytes}
            onRaise={nextCap === null ? undefined : () => image.applyRaisedCap(nextCap)}
          />
        </>
      ) : null}
    </>
  );
}
