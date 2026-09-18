// The page-setup surface: the document-settings section editing the template's
// top-level `page:` map (size, orientation, custom dimensions). It is a live
// view — it re-reads `controller.read('page')` each render, and every control
// dispatches a named `designer-core` op (AI parity, no direct mutation).
//
// The page is pictured only by the engine-rendered preview column beside this
// form (on a window wide enough to show it). A known named size states its oriented dimensions as a line of text under the
// orientation select; there is deliberately no drawn outline here — a blank
// page-shaped rectangle next to the real preview read as a broken one.
//
// The custom dimension cluster is its own module (`CustomSizeFields`) because it
// carries a commit discipline of its own; the rest of the form — size select,
// orientation, the dimension line, margins — assembles here.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { localeInfo } from '../i18n/locales';
import { INPUT } from '../ui/chrome';
import { CustomSizeFields } from './CustomSizeFields';
import { Field } from './fields';
import { MarginEditor } from './MarginEditor';
import { applyPanelOp } from './model';
import { type Orientation, orientedDimensions, readPageView } from './pageSetupModel';
import { orientationOp, selectSizeOp } from './pageSetupOps';
import { CUSTOM, PAGE_SIZE_NAMES } from './pageSizes';

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
  // The second group is the sizes the locale group does NOT already offer. The
  // two groups used to overlap — a en-US user saw `Letter` twice, once under
  // each heading, with nothing to tell the two entries apart — and a duplicated
  // option is a worse answer to "which one do I pick" than a shorter list.
  const otherSizes = PAGE_SIZE_NAMES.filter((name) => !localeSizes.includes(name));
  // A loaded template can carry a size the GUI does not know (an invalid
  // hand-authored value the engine reports separately); surface it as its own
  // option so the controlled select always has a matching value to show.
  const unknownNamed =
    view.mode === 'named' && !PAGE_SIZE_NAMES.includes(view.sizeName) ? view.sizeName : null;

  const dimensions = orientedDimensions(view);

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
            <optgroup label={t('pageSetup.otherSizes')}>
              {otherSizes.map((name) => (
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
        {dimensions === null ? null : (
          // Sits under the orientation select because the dimensions depend on it.
          <p className="-mt-0.5 mb-2 text-sm text-muted">{dimensions}</p>
        )}

        <MarginEditor controller={controller} />
      </div>
    </div>
  );
}
