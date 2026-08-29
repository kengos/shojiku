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
import type { FormatCatalog, PatternProbe, ProbeResult, RawPage } from '../engine/types';
import type { FormatUsage } from '../formats/usage';
import { useI18n } from '../i18n/context';
import type { StyleUsage } from '../styles/usage';
import { TOUR_ANCHORS } from '../tutorial/anchors';
import { IconButton } from '../ui/Button';
import { SECTION_TITLE } from '../ui/chrome';
import { IconClose } from '../ui/icons';
import { BaseTextPreview } from './BaseTextPreview';
import { DocSectionBody } from './DocSectionBody';
import { DocSectionRail } from './DocSectionRail';
import {
  type DocSection,
  SECTION_ORDER,
  SECTION_TITLE_KEYS,
  sectionSummaries,
} from './docSections';
import { hasCapability } from './itemPanelProps';

export interface DocumentSettingsPageProps {
  readonly controller: EditorController;
  readonly fontFamilies?: readonly string[];
  readonly capabilities?: readonly string[];
  /** The locale's default font face — seeded into the default-style family. */
  readonly defaultFontFamily?: string;
  readonly styleUsage?: StyleUsage | null;
  /** The format-reference index, for the registry section's impact scope and
   * its rename/delete rewrites. `null` (an unmaterialized document) makes both
   * refuse rather than rewrite against no reference data. */
  readonly formatUsage?: FormatUsage | null;
  /** The engine's format catalog — every variant the document may pick and what
   * each one renders. `null` before the first answer, and permanently on a
   * transport that cannot answer; the section degrades rather than blanking. */
  readonly formatCatalog?: FormatCatalog | null;
  /** Preview a pattern that is not authored yet. */
  readonly probeFormat?: (probes: readonly PatternProbe[]) => Promise<readonly ProbeResult[]>;
  /** The session's template-size cap. The registry rename grows the document
   * by the name delta at every reference, so it measures before applying. */
  readonly maxBytes: number;
  /** The engine's last-good rendered pages (the live preview; the pane shrinks
   * them via CSS, so no render scale is needed). Empty → a "no preview yet"
   * note (a document that has never rendered). */
  readonly pages: readonly RawPage[];
  /** An external request to scroll a section into view (a style field's jump).
   * The `nonce` re-triggers even when the same section is requested twice. */
  readonly focus?: { readonly section: DocSection; readonly nonce: number };
  readonly onClose: () => void;
}

/** A host that supplied no probe: every probe resolves to an EMPTY list, which
 * the pattern surface reads as "could not answer" and says so, rather than
 * every call site branching on availability. */
const NO_PROBE = async (): Promise<readonly ProbeResult[]> => [];

export function DocumentSettingsPage({
  controller,
  fontFamilies = [],
  capabilities,
  defaultFontFamily,
  styleUsage = null,
  formatUsage = null,
  formatCatalog = null,
  probeFormat = NO_PROBE,
  maxBytes,
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

  // A section whose engine capability is missing is not listed at all — an
  // empty rail row that opens onto nothing is worse than no row.
  const showMetadata = hasCapability(capabilities, 'template.document.metadata');
  // The 表示形式 section holds two capability-gated halves; it is listed only
  // when at least one of them would render, because an empty rail row that
  // opens onto nothing is worse than no row.
  const showDefaults = hasCapability(capabilities, 'template.defaults');
  const showRegistry = hasCapability(capabilities, 'template.formats');
  const sections = SECTION_ORDER.filter((section) => {
    if (section === 'metadata') {
      return showMetadata;
    }
    return section !== 'formats' || showDefaults || showRegistry;
  });

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
          sections={sections}
          onSelect={setCurrent}
        />
        {/* The selected section, alone: roomy, and short enough to read without
            scrolling on every document the presets ship. */}
        <div
          className="min-w-0 flex-1 overflow-y-auto px-6 py-5"
          data-tour={TOUR_ANCHORS.docSettings}
        >
          <div className="mx-auto max-w-[520px]">
            <section>
              <h3 className={SECTION_TITLE}>{t(SECTION_TITLE_KEYS[current])}</h3>
              <DocSectionBody
                section={current}
                controller={controller}
                fontFamilies={fontFamilies}
                capabilities={capabilities}
                defaultFontFamily={defaultFontFamily}
                styleUsage={styleUsage}
                formatUsage={formatUsage}
                formatCatalog={formatCatalog}
                probeFormat={probeFormat}
                showDefaults={showDefaults}
                showRegistry={showRegistry}
                maxBytes={maxBytes}
              />
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
