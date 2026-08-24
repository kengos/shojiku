// The form a header/footer band selection opens: which pages the band prints
// on, and how tall it is. Before this existed a band was readable in the layer
// tree and editable nowhere — not even in the 13 bundled presets that author
// one — so `repeat`/`height` could only ever be changed by hand-editing YAML.
//
// It is `CellPanel`'s third arm, beside a table COLUMN and a header GROUP: the
// three selections in the editor that have no `type:` of their own and so
// cannot build an `ItemView`.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { BAND_LABEL_KEYS, type BandName } from '../insert/bandCreate';
import { PANEL, SECTION_TITLE } from '../ui/chrome';
import {
  BAND_REPEATS,
  bandHeightOp,
  bandRepeatOp,
  effectiveRepeat,
  isKnownRepeat,
  readBandView,
} from './bandModel';
import { Field } from './fields';
import { applyPanelOp, stepValueOp } from './model';
import { StepperField } from './StepperField';

/** One step of the ▲▼ buttons, in pt. Band heights run in tens (the bundled
 * examples: 40-100), so a 1pt step would be a long click; 4pt is the same
 * "one useful nudge" the grid step gives a canvas drag. */
const HEIGHT_STEP_PT = 4;

export interface BandFormProps {
  readonly controller: EditorController;
  /** The band's structural path (`sections.header` / `sections.footer`). */
  readonly path: string;
  readonly band: BandName;
}

export function BandForm({ controller, path, band }: BandFormProps) {
  const { t } = useI18n();
  const view = readBandView(controller.read(path));
  const dispatch = (op: Op | null) => {
    applyPanelOp(controller, op);
  };
  // The document's own value keeps a seat even when it is not one of the
  // engine's four modes: an older/newer file's mode stays visible and
  // selected rather than being silently displayed as the default.
  const current = effectiveRepeat(view.repeat);
  const options = isKnownRepeat(current) ? BAND_REPEATS : [current, ...BAND_REPEATS];
  return (
    <aside className={PANEL} aria-label={t('panel.title')}>
      <section>
        <h3 className={SECTION_TITLE}>{t(BAND_LABEL_KEYS[band])}</h3>
        <Field label={t('panel.band.repeat')}>
          <select
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-text"
            value={current}
            onChange={(event) =>
              dispatch(bandRepeatOp(path, view.repeat, event.currentTarget.value))
            }
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {isKnownRepeat(option) ? t(`panel.band.repeat.${option}`) : option}
              </option>
            ))}
          </select>
        </Field>
        <StepperField
          label={t('panel.band.height')}
          value={view.height}
          unit="pt"
          canStep={view.height !== ''}
          onCommit={(raw) => dispatch(bandHeightOp(path, raw))}
          onStep={(dir) =>
            dispatch(stepValueOp(path, ['height'], view.height, dir, HEIGHT_STEP_PT, 'number'))
          }
        />
        <p className="m-0 text-sm text-muted">{t('panel.band.heightHint')}</p>
      </section>
    </aside>
  );
}
