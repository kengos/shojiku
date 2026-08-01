// The page-setup surface: the panel's no-selection state, editing the template's
// top-level `page:` map (size, orientation, custom dimensions). It is a live
// view — it re-reads `controller.read('page')` each render, and every control
// dispatches a named `designer-core` op (AI parity, no direct mutation). The
// size thumbnail is CHROME: it draws the input values as a proportional page
// outline, never document content (the content preview stays engine-rendered).
//
// The custom dimension cluster is its own module (`CustomSizeFields`) because it
// carries a commit discipline of its own; the rest of the form — size select,
// orientation, margins, thumbnail — assembles here.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { localeInfo } from '../i18n/locales';
import { INPUT } from '../ui/chrome';
import { CustomSizeFields } from './CustomSizeFields';
import { Field } from './fields';
import { MarginEditor } from './MarginEditor';
import { applyPanelOp } from './model';
import { type Orientation, readPageView, sizeLabel } from './pageSetupModel';
import { orientationOp, selectSizeOp } from './pageSetupOps';
import { CUSTOM, PAGE_SIZE_NAMES, thumbnailGeometry } from './pageSizes';

// The padded square (px) the size outline centers in.
const THUMB_BOX = 140;

export interface PageSetupProps {
  readonly controller: EditorController;
  /** Show the internal `ページ設定` heading (default). The document-settings
   * accordion passes `false` — its disclosure button is the heading. */
  readonly titled?: boolean;
}

export function PageSetup({ controller, titled = true }: PageSetupProps) {
  const { t, locale } = useI18n();
  const view = readPageView(controller.read('page'));

  const localeSizes = localeInfo(locale)?.pageSizes ?? [];
  // A loaded template can carry a size the GUI does not know (an invalid
  // hand-authored value the engine reports separately); surface it as its own
  // option so the controlled select always has a matching value to show.
  const unknownNamed =
    view.mode === 'named' && !PAGE_SIZE_NAMES.includes(view.sizeName) ? view.sizeName : null;

  const geom = thumbnailGeometry(view.dims?.w ?? Number.NaN, view.dims?.h ?? Number.NaN);

  return (
    <div>
      {titled ? <h3>{t('pageSetup.title')}</h3> : null}
      <div>
        <Field label={t('pageSetup.size')}>
          <select
            className={INPUT}
            value={view.sizeName}
            onChange={(event) => controller.applyAll(selectSizeOp(view, event.currentTarget.value))}
          >
            {unknownNamed !== null ? <option value={unknownNamed}>{unknownNamed}</option> : null}
            {localeSizes.length > 0 ? (
              <optgroup label={t('pageSetup.localeSizes')}>
                {localeSizes.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label={t('pageSetup.allSizes')}>
              {PAGE_SIZE_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
            <option value={CUSTOM}>{t('pageSetup.custom')}</option>
          </select>
        </Field>

        {view.mode === 'custom' ? (
          <CustomSizeFields controller={controller} custom={view.custom} />
        ) : null}

        <Field label={t('pageSetup.orientation')}>
          <select
            className={INPUT}
            value={view.orientation}
            disabled={view.mode === 'custom'}
            onChange={(event) =>
              // The select offers only these two values, so the cast is total.
              applyPanelOp(
                controller,
                orientationOp(view, event.currentTarget.value as Orientation),
              )
            }
          >
            <option value="portrait">{t('pageSetup.portrait')}</option>
            <option value="landscape">{t('pageSetup.landscape')}</option>
          </select>
        </Field>

        <MarginEditor controller={controller} />

        <figure className="flex justify-center py-2">
          <svg
            width={THUMB_BOX}
            height={THUMB_BOX}
            aria-label={t('pageSetup.preview', { size: sizeLabel(view) })}
          >
            <title>{t('pageSetup.preview', { size: sizeLabel(view) })}</title>
            <rect
              x={(THUMB_BOX - geom.width) / 2}
              y={(THUMB_BOX - geom.height) / 2}
              width={geom.width}
              height={geom.height}
              // No stylesheet ships with the component, so the paper look is
              // inlined (an unfilled rect would default to black).
              fill="#ffffff"
              stroke="#94a3b8"
              strokeWidth={1}
            />
          </svg>
          <figcaption>{sizeLabel(view)}</figcaption>
        </figure>
      </div>
    </div>
  );
}
