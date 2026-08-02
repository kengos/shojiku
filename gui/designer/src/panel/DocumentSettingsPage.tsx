// The fullscreen document-settings view: the 「whole-document」 root row and the
// File-menu 「document settings…」 entry open it, and it takes over the WHOLE editor area
// while open (the layer-tree pane steps aside too — this is a place you visit
// and leave, not a panel you work beside).
//
// gdoc-style — one dedicated settings surface, navigated by a SECTION RAIL
// (`DocSectionRail`): the left column lists the sections with a one-line summary
// of each, the middle shows exactly one of them, and the preview sits to the
// right. Stacking all four sections in one scroller instead put the base-text section
// (the document's base text) directly above the styles section (the named-style
// registry) — two different things reading as one, which is the misreading this
// view was reorganized to remove — and ran ~3.7 screens deep on a document with
// eight styles. One section at a time, each fitting its column, is the fix.
//
// The preview paints the engine's last-good pages (the same pixels the canvas
// shows), so a page-size / margin / default-style edit is seen changing the
// actual document, not a chrome mock — except on the base-text section, where
// the subject is the base text itself and the preview shows a sample paragraph
// set in it (`BaseTextPreview`). No new render path — the pages come from the
// Designer's existing preview loop; this view only DISPLAYS them.

import { useEffect, useState } from 'react';
import { PageUnderlay } from '../canvas/PageUnderlay';
import type { EditorController } from '../editor/useEditor';
import type { RawPage } from '../engine/types';
import { useI18n } from '../i18n/context';
import type { StyleUsage } from '../styles/usage';
import { IconButton } from '../ui/Button';
import { SECTION_TITLE } from '../ui/chrome';
import { IconClose } from '../ui/icons';
import { BaseTextPreview } from './BaseTextPreview';
import { DocSectionRail } from './DocSectionRail';
import { DocumentDefaults } from './DocumentDefaults';
import { type DocSection, SECTION_TITLE_KEYS, sectionSummaries } from './docSections';
import { PageSetup } from './PageSetup';
import { StylesManager } from './StylesManager';

export interface DocumentSettingsPageProps {
  readonly controller: EditorController;
  readonly fontFamilies?: readonly string[];
  readonly capabilities?: readonly string[];
  /** The locale's default font face — seeded into the default-style family. */
  readonly defaultFontFamily?: string;
  readonly styleUsage?: StyleUsage | null;
  /** The engine's last-good rendered pages (the live preview; the pane shrinks
   * them via CSS, so no render scale is needed). Empty → a "no preview yet"
   * note (a document that has never rendered). */
  readonly pages: readonly RawPage[];
  /** An external request to scroll a section into view (a style field's jump).
   * The `nonce` re-triggers even when the same section is requested twice. */
  readonly focus?: { readonly section: DocSection; readonly nonce: number };
  readonly onClose: () => void;
}

export function DocumentSettingsPage({
  controller,
  fontFamilies = [],
  capabilities,
  defaultFontFamily,
  styleUsage = null,
  pages,
  focus,
  onClose,
}: DocumentSettingsPageProps) {
  const { t } = useI18n();
  const [current, setCurrent] = useState<DocSection>(focus?.section ?? 'page');

  // A jump SELECTS its section. Keyed by nonce so a repeat jump to the same
  // section still fires; guarded so it does not re-fire on unrelated renders.
  // (Selecting beats the scroll this used to do — a scroll could land the reader
  // between two sections, and only one section exists on screen now.)
  const nonce = focus?.nonce;
  const focusSection = focus?.section;
  // biome-ignore lint/correctness/useExhaustiveDependencies: nonce is the intended trigger; focusSection is read fresh at that nonce.
  useEffect(() => {
    if (focusSection !== undefined) {
      setCurrent(focusSection);
    }
  }, [nonce]);

  const sectionBody = (section: DocSection) => {
    switch (section) {
      case 'page':
        return <PageSetup controller={controller} titled={false} />;
      case 'defaults':
        return (
          <DocumentDefaults
            controller={controller}
            fontFamilies={fontFamilies}
            capabilities={capabilities}
            defaultFontFamily={defaultFontFamily}
            section="style"
          />
        );
      case 'styles':
        return (
          <StylesManager
            controller={controller}
            fontFamilies={fontFamilies}
            usage={styleUsage}
            titled={false}
          />
        );
      default:
        return (
          <DocumentDefaults
            controller={controller}
            fontFamilies={fontFamilies}
            capabilities={capabilities}
            section="locale"
          />
        );
    }
  };

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg"
      aria-label={t('docSettings.title')}
    >
      <header className="flex min-h-[42px] items-center gap-2 border-b border-border bg-chrome px-3">
        <IconButton label={t('docSettings.close')} variant="ghost" onClick={onClose}>
          <IconClose />
        </IconButton>
        <h2 className="m-0 text-base font-semibold text-text">{t('docSettings.title')}</h2>
      </header>
      <div className="flex min-h-0 flex-1">
        {/* One line per rail entry saying what that section currently holds, so
            the rail answers "where is X" without opening every section. */}
        <DocSectionRail
          current={current}
          summaries={sectionSummaries(controller, t)}
          onSelect={setCurrent}
        />
        {/* The selected section, alone: roomy, and short enough to read without
            scrolling on every document the presets ship. */}
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto max-w-[520px]">
            <section>
              <h3 className={SECTION_TITLE}>{t(SECTION_TITLE_KEYS[current])}</h3>
              {sectionBody(current)}
            </section>
          </div>
        </div>
        {/* The preview: the engine's real last-good pages (read-only — no
            overlay, no selection), except on the base-text section, whose subject is the
            base text rather than the page. */}
        <aside
          className="hidden w-[340px] shrink-0 overflow-y-auto border-l border-border bg-canvas p-4 lg:block"
          aria-label={t('docSettings.preview')}
        >
          {current === 'defaults' ? (
            <BaseTextPreview controller={controller} defaultFontFamily={defaultFontFamily} />
          ) : pages.length === 0 ? (
            <p className="m-0 text-center text-sm text-muted">{t('docSettings.previewEmpty')}</p>
          ) : (
            <div className="flex flex-col items-center gap-3 [&_canvas]:h-auto [&_canvas]:w-full [&_canvas]:max-w-full">
              {pages.map((page, index) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: pages are a stable order-preserving list with no identity of their own.
                  key={`preview-page-${index}`}
                  className="w-full shadow-[0_2px_12px_var(--sj-paper-shadow)]"
                >
                  <PageUnderlay page={page} />
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
