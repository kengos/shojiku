// The canvas topbar: the breadcrumb, the placement chip, and the transient
// pdf/image notices. Every string it renders is a CATALOG key — never document
// content and never engine text (a failed render's reasons stay in the
// diagnostics panel below the canvas).

import { type Manipulation, manipulationFor } from '../canvas/manipulate';
import type { EditorController } from '../editor/useEditor';
import type { ImageImport } from '../hooks/useImageImport';
import type { MultiSelect } from '../hooks/useMultiSelect';
import type { PdfAction } from '../hooks/usePdfAction';
import { useI18n } from '../i18n/context';
import { Breadcrumb } from '../tree/Breadcrumb';
import type { TreeView } from '../tree/model';
import { BTN } from '../ui/chrome';

/** The placement chip's catalog key for a classification (movable place,
 * reorderable place, or the fixed reason — one flat key namespace). */
function placeKey(ability: Manipulation): string {
  return ability.kind === 'fixed'
    ? `canvas.place.${ability.reason}`
    : `canvas.place.${ability.place}`;
}

/** The notice pill shared by the pdf and image `<output>`s. */
const NOTICE =
  'shrink-0 rounded-md border border-border bg-warn-bg px-2 py-px text-sm whitespace-nowrap text-warn-text';

export interface CanvasTopbarProps {
  readonly editor: EditorController;
  readonly multi: MultiSelect;
  readonly image: ImageImport;
  readonly pdf: PdfAction;
  readonly treeView: TreeView | null;
}

export function CanvasTopbar({ editor, multi, image, pdf, treeView }: CanvasTopbarProps) {
  const { t } = useI18n();
  // Locals, not property reads: narrowing follows a local binding.
  const { read, select, selection } = editor;
  const { refused } = multi;
  const { nextCap, imageNotice } = image;

  // The selected box's placement (the chip's subject) — recomputed per render
  // (the classification is a few capped reads; the edit bump already
  // re-renders).
  const selectedAbility: Manipulation | null =
    selection === null ? null : manipulationFor(read, selection);
  const chipKey =
    refused !== null
      ? `canvas.place.${refused}`
      : selectedAbility !== null
        ? placeKey(selectedAbility)
        : null;

  return (
    <div className="sj-canvas-topbar flex min-h-[30px] items-center gap-2 border-b border-border bg-chrome px-3">
      <Breadcrumb view={treeView} selection={selection} onSelect={select} />
      {chipKey !== null ? (
        // <output> is a polite live region: a refused drag's reason is
        // announced; the text is ALWAYS a catalog string (never document
        // content). The `--refused` marker class drives the pulse keyframe
        // (the one animation kept in styles.css).
        <output
          className={`shrink-0 rounded-md border bg-surface px-2 py-px text-sm whitespace-nowrap ${
            refused !== null
              ? 'sj-place-chip--refused border-accent text-accent'
              : 'border-border text-muted'
          }`}
        >
          {t(chipKey)}
        </output>
      ) : null}
      {pdf.pdfNotice !== null ? (
        // The PDF action's transient state (rendering / failed) — a
        // localized catalog string, never engine text.
        <output className={NOTICE}>{t(pdf.pdfNotice)}</output>
      ) : null}
      {imageNotice !== null ? (
        // The last image-import result (downscaled / refused / over-cap) —
        // a localized catalog string, never a file name or document text.
        // An over-cap refusal offers the raise here (no image is present
        // yet, so the headroom indicator is not shown to carry it).
        <span className="inline-flex items-center gap-1">
          <output className={NOTICE}>{t(imageNotice)}</output>
          {imageNotice === 'image.notice.overCap' && nextCap !== null ? (
            <button type="button" className={BTN} onClick={() => image.applyRaisedCap(nextCap)}>
              {t('image.headroom.raise')}
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
