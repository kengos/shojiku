// The format controls: a selection-context cluster of high-frequency formatting
// controls, embedded inline in the slim toolbar (role=group inside the toolbar
// row). It reads the selected item through the editor and dispatches ONE named
// op per control — every write reuses the panel op builders (via
// `toolbar/model`), so it carries no wire knowledge the panel does not. The
// cluster order and grouping mirror Google Docs (styles | font+size | B/I/color
// | align, thin rules between groups); controls render only for the selection
// they apply to (text → the full set; rect → fill/styles; anything else —
// qr_code, nothing selected, a ghost path — renders NOTHING, and the slim
// toolbar keeps its own height so the canvas never shifts).
//
// This file is the SHELL: it resolves the selection into the toolbar model and
// its derived-value context (`formatContext` — one object rather than nine
// threaded values), owns the style-capture modal state, and lays the clusters
// out. Each cluster is its own module — `TypographyGroup` (family + size + B/I),
// `StylePicker`, `ColorControl`, `BorderControl`, `AlignControl` — over the
// shared chrome in `fmtChrome`.

import { useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { readSelectionView } from '../panel/columnsModel';
import { StyleCaptureModal } from '../styles/StyleCaptureModal';
import type { StyleUsage } from '../styles/usage';
import { AlignControl } from './AlignControl';
import { BorderControl } from './BorderControl';
import { ColorControl } from './ColorControl';
import { effectiveStyles } from './effective';
import { Sep } from './fmtChrome';
import { alignOp, formatContext, readToolbar, type ToolbarModel } from './model';
import { StylePicker } from './StylePicker';
import { TypographyGroup } from './TypographyGroup';
import { alignedValue } from './wire';

export interface FormatToolbarProps {
  readonly controller: EditorController;
  readonly path: string | null;
  /** Host-supplied `fontFamily` options (fonts the host installed) — the
   * family dropdown's rows. */
  readonly fontFamilies?: readonly string[];
  /** The document's named-style usage index, for the style picker's impact
   * scope. `null` when the document did not materialize (the picker then shows
   * no counts). */
  readonly usage: StyleUsage | null;
  /** Open the host's add-font flow (the File-menu action, surfaced as the
   * family dropdown's tail row). Absent → no tail row. */
  readonly onAddFont?: () => void;
  /** The engine's capability keys — gate the border control's per-side matrix
   * and line-style select (absent list = show everything). */
  readonly capabilities?: readonly string[];
  /** The engine-default floor for the cascade mirror — an unset inherited key
   * shows its real engine default (e.g. the size box reads `10`, not blank). */
  readonly floor?: Readonly<Record<string, unknown>>;
}

export function FormatToolbar({
  controller,
  path,
  fontFamilies = [],
  usage,
  onAddFont,
  capabilities,
  floor,
}: FormatToolbarProps) {
  const { t } = useI18n();
  // The open style-capture modal: `{ mode: 'create' }` (save the selection as a
  // new style) or `{ mode: 'update', target }` (rewrite an applied style). It
  // lives here, not inside the picker popover, so it survives the popover
  // closing when a tail row is clicked. It carries the path it was opened FOR:
  // if the selection changes while it is open (an undo fired from modal focus
  // can remove the item and the next selection would otherwise resurrect the
  // modal against the wrong item), a stale entry renders nothing.
  const [capture, setCapture] = useState<
    | { readonly mode: 'create'; readonly path: string }
    | { readonly mode: 'update'; readonly target: string; readonly path: string }
    | null
  >(null);
  // A selection pointing at a removed/undone node reads as undefined — treat it
  // like no selection (an empty bar), not a formatting target.
  const raw = path === null ? undefined : controller.read(path);
  // Column-aware: a table column formats like the text item it defaults to,
  // whether or not it spells its `type` out.
  const view = raw === undefined || path === null ? null : readSelectionView(raw, path);
  const eff = path === null || view === null ? null : effectiveStyles(controller.read, path, floor);
  const model: ToolbarModel | null = eff === null ? null : readToolbar(view, eff);

  // No formatting target (nothing selected, a ghost path, or a non-boxed item
  // like `line`) → render nothing; the slim toolbar keeps its own height, so an
  // absent format cluster never shifts the canvas.
  if (path === null || view === null || model === null) {
    return null;
  }

  // Everything the clusters and the capture modal need about this selection,
  // derived ONCE (the `cascadeContext` shape: build the context, then read it).
  const ctx = formatContext({ read: controller.read, path, view, raw, capabilities });

  const dispatch = (op: ReturnType<typeof alignOp>) => {
    if (op !== null) {
      controller.apply(op);
    }
  };

  // The format controls sit inside the slim toolbar (role=toolbar); they are a
  // plain flex cluster in the gdoc order — styles | font + size | B I color —
  // align — with thin rules between groups.
  return (
    <div className="sj-format-toolbar-body flex flex-wrap items-center gap-1">
      <Sep />
      {ctx.showStyles ? (
        <>
          <StylePicker
            view={view}
            path={path}
            controller={controller}
            usage={usage}
            options={ctx.styleOptions}
            triggerLabel={ctx.updateTarget ?? t('toolbar.styles.none')}
            canCapture={ctx.canCapture}
            updateTarget={ctx.updateTarget}
            onSaveAs={() => setCapture({ mode: 'create', path })}
            onUpdate={(target) => setCapture({ mode: 'update', target, path })}
          />
          <Sep />
        </>
      ) : null}
      {model.typography ? (
        <TypographyGroup
          model={model}
          path={path}
          fontFamilies={fontFamilies}
          onAddFont={onAddFont}
          dispatch={dispatch}
        />
      ) : null}
      <ColorControl
        label={model.typography ? t('toolbar.textColor') : t('toolbar.fill')}
        eff={model.eff[model.colorKey]}
        colorKey={model.colorKey}
        path={path}
        controller={controller}
      />
      {ctx.showBorder ? (
        <BorderControl
          view={ctx.border}
          radius={ctx.radius}
          path={path}
          controller={controller}
          capabilities={capabilities}
          isTable={view.type === 'table'}
        />
      ) : null}
      {model.typography ? (
        <>
          <Sep />
          <AlignControl
            eff={model.eff.textAlign}
            active={alignedValue(model.align)}
            onPick={(value) => dispatch(alignOp(path, model.eff.textAlign, value))}
          />
        </>
      ) : null}
      {capture === null || capture.path !== path ? null : capture.mode === 'update' ? (
        <StyleCaptureModal
          open
          mode="update"
          onClose={() => setCapture(null)}
          controller={controller}
          path={path}
          captured={ctx.captured}
          existingNames={ctx.registry}
          currentStyleNames={view.styleNames}
          targetName={capture.target}
          usage={usage}
        />
      ) : (
        <StyleCaptureModal
          open
          mode="create"
          onClose={() => setCapture(null)}
          controller={controller}
          path={path}
          captured={ctx.captured}
          existingNames={ctx.registry}
          currentStyleNames={view.styleNames}
        />
      )}
    </div>
  );
}
