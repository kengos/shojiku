// The base-text section's preview: a sample paragraph set in the document's
// base text, so a size / family / line-height change is SEEN rather than read
// off a number. It is a chrome approximation (browser type, not the engine's
// layout) — the same approximation the style-registry rows and the toolbar's
// style picker already show, and it is labeled as a sample, never as the page.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { PREVIEW_CHIP, stylePreview } from '../styles/preview';
import { readDefaultsView } from './defaultsModel';
import { buildStyleFloor } from './engineDefaults';

/** The authored style with its UNSET keys dropped, so a spread over the engine
 * floor keeps the floor's value for every key the document did not author. */
function omitUnset(style: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(style).filter(([, value]) => value !== ''));
}

export interface BaseTextPreviewProps {
  readonly controller: EditorController;
  readonly defaultFontFamily?: string;
}

export function BaseTextPreview({ controller, defaultFontFamily }: BaseTextPreviewProps) {
  const { t } = useI18n();
  const authored = readDefaultsView(controller.read('defaults')).style;
  // The preview shows what the document RENDERS at, so an unset key falls to the
  // engine's own fallback (the host-derived family included) rather than to the
  // browser's — a blank family would otherwise preview in the chrome's face.
  const effective = { ...buildStyleFloor(defaultFontFamily), ...omitUnset(authored) };
  return (
    <div>
      <p className="m-0 mb-2 text-sm text-muted">{t('docSettings.baseTextPreview')}</p>
      {/* Paper-shaped and several lines deep, so a size / line-height / align
          change is visible AS SET TEXT — a one-line chip showed the face and
          nothing else. */}
      <div
        className={`${PREVIEW_CHIP} block rounded-md p-5 shadow-[0_2px_12px_var(--sj-paper-shadow)]`}
        style={stylePreview(effective)}
      >
        <p className="m-0">{t('docSettings.baseTextSample')}</p>
        <p className="mt-3 mb-0">{t('docSettings.baseTextSample2')}</p>
      </div>
    </div>
  );
}
