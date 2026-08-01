// The document-defaults surface: it edits the template's `defaults:` map, which
// is two unrelated things — the cascade root style (`DefaultsStyleFields`) and
// the locale / currency document settings (`DefaultsLocaleFields`). This module
// is the shell that gates them on the engine's capabilities and arranges
// whichever half its host asked for.
//
// `section` picks: the document-settings view opens one half at a time and
// supplies the heading itself; with no `section` the surface renders the
// standalone stacked form under its own headings.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { SECTION_TITLE } from '../ui/chrome';
import { DefaultsLocaleFields } from './DefaultsLocaleFields';
import { DefaultsStyleList, DefaultsStyleSection } from './DefaultsStyleFields';
import { hasCapability } from './itemPanelProps';

export interface DocumentDefaultsProps {
  readonly controller: EditorController;
  readonly fontFamilies?: readonly string[];
  readonly capabilities?: readonly string[];
  /** The locale's default font face (the engine's `fontFamily` default) —
   * seeded into the unset family field. Absent → that field shows a localized
   * placeholder instead of a seed value. */
  readonly defaultFontFamily?: string;
  /** When set, render ONLY that half — the document-settings surface supplies
   * the heading, so the internal `<h3>`/`<h4>` chrome is dropped: `'locale'` =
   * the locale + currency controls, `'style'` = the inherited-style defaults.
   * Undefined = the standalone stacked form (its own headings). */
  readonly section?: 'locale' | 'style';
}

/** A capability-gated feature is shown when the host did not gate at all, or the
 * key is present (never version-sniff). */
export function DocumentDefaults({
  controller,
  fontFamilies = [],
  capabilities,
  defaultFontFamily,
  section,
}: DocumentDefaultsProps) {
  const { t } = useI18n();
  const showDocument = hasCapability(capabilities, 'template.defaults.document');
  const showStyle = hasCapability(capabilities, 'template.defaults');

  // Section mode: just the requested half's fields (the document-settings view
  // supplies the heading). A capability-gated-off half renders nothing.
  if (section === 'locale') {
    return showDocument ? (
      <div>
        <DefaultsLocaleFields controller={controller} />
      </div>
    ) : null;
  }
  if (section === 'style') {
    return showStyle ? (
      <DefaultsStyleSection
        controller={controller}
        fontFamilies={fontFamilies}
        defaultFontFamily={defaultFontFamily}
      />
    ) : null;
  }

  // Standalone stacked form (its own headings). The engine has neither defaults
  // capability — render nothing rather than an empty header (a newer Designer
  // over a much older engine).
  if (!showDocument && !showStyle) {
    return null;
  }
  return (
    <section className="mb-4">
      <h3 className={SECTION_TITLE}>{t('defaults.title')}</h3>
      <div>
        {showDocument ? <DefaultsLocaleFields controller={controller} /> : null}
        {showStyle ? (
          <>
            <h4 className="mt-2 mb-1 text-sm font-semibold text-muted">
              {t('defaults.textSection')}
            </h4>
            <DefaultsStyleList
              controller={controller}
              fontFamilies={fontFamilies}
              defaultFontFamily={defaultFontFamily}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}
