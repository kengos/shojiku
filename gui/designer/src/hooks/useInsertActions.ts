// The insert surfaces: the plain element insert, and the four scaffold dialogs
// (container picker / iterable / create-field / paste-import). Every one of them
// resolves a target, applies ONE op, and selects the new item on success; the
// three that also extend the sample data commit those rows only AFTER the insert
// succeeded, so a refused op never leaves orphan params behind. This file owns
// the plain insert plus the menu gates, and composes the four scaffold hooks
// over one shared `InsertContext`.

import { useCallback, useRef } from 'react';
import type { EditorController } from '../editor/useEditor';
import type { I18n } from '../i18n/context';
import { bandBoxHeightPt } from '../insert/bandGeometry';
import { bandInsertY, bandPlaced } from '../insert/bandPlacement';
import type { FieldChoice, FieldRefusal } from '../insert/fieldModel';
import { type InsertGroup, type InsertKind, insertMenuGroups } from '../insert/insertMenu';
import { insertSnippet } from '../insert/insertSnippet';
import {
  type IterableChoice,
  type IterableRefusal,
  iterableAvailable,
} from '../insert/iterableModel';
import { resolveInsertTarget } from '../insert/model';
import type { PasteRefusal } from '../insert/paste';
import type { PasteGrid } from '../insert/pasteGrid';
import type { PaletteGroup } from '../palette/model';
import type { LastGoodPreview } from '../preview/reducer';
import type { ValueSynth } from '../sample/synth';
import type { SampleSet } from '../sample/variants';
import { bandOf, contentWidthPt } from './geometry';
import type { InsertContext } from './insertContext';
import { useContainerInsert } from './useContainerInsert';
import { useFieldInsert } from './useFieldInsert';
import { useIterableInsert } from './useIterableInsert';
import { usePasteInsert } from './usePasteInsert';

export interface InsertActionsOptions {
  readonly editor: EditorController;
  readonly t: I18n['t'];
  readonly lastGood: LastGoodPreview | null;
  readonly params: string;
  readonly sampleSet: SampleSet;
  readonly commitSet: (next: SampleSet) => void;
  readonly synth: ValueSynth | undefined;
  readonly locale: string;
  /** The engine's capability keys — the insert surfaces gate on them so a newer
   * GUI never offers syntax an older engine parse-rejects. */
  readonly capabilities: readonly string[] | undefined;
  /** Whether the host injected an image codec (the image entry's gate). */
  readonly hasImageCodec: boolean;
  /** The palette's view over the effective definitions — what the iterable
   * scaffold can bind to. */
  readonly paletteGroups: readonly PaletteGroup[] | null;
  readonly workshop: boolean;
}

export interface InsertActions {
  readonly insert: (kind: InsertKind) => void;
  /** The insert menu's groups (elements + scaffolds), capability-gated. */
  readonly insertGroups: readonly InsertGroup[];
  /** Whether a scaffold may name a charset-unsafe field through a declaration
   * instead of degrading (an older engine parse-rejects `bindings:`). Shared
   * with the palette drag, which scaffolds the same way. */
  readonly canDeclare: boolean;
  /** The newest paintable render, read inside callbacks without re-creating
   * them (the canvas posture: display last-good, act on it only for geometry).
   * Shared with the block insert, which band-places the same way. */
  readonly previewRef: { readonly current: LastGoodPreview | null };
  readonly containerPickerOpen: boolean;
  readonly setContainerPickerOpen: (open: boolean) => void;
  readonly handleContainerPick: (columns: number, rows: number) => void;
  readonly iterableOpen: boolean;
  readonly setIterableOpen: (open: boolean) => void;
  readonly handleIterableConfirm: (choice: IterableChoice) => IterableRefusal | null;
  readonly fieldOpen: boolean;
  readonly setFieldOpen: (open: boolean) => void;
  readonly openFieldInsert: () => void;
  readonly handleFieldConfirm: (choice: FieldChoice) => FieldRefusal | null;
  /** The picker tail is armed only in workshop mode (the ItemPanel further gates it
   * to document scope — a fresh top-level key cannot bind a row-scoped picker). */
  readonly onCreateField: ((bindKey: (key: string) => void) => void) | undefined;
  readonly pasteOpen: boolean;
  readonly setPasteOpen: (open: boolean) => void;
  readonly handlePasteConfirm: (grid: PasteGrid) => PasteRefusal | null;
}

export function useInsertActions({
  editor,
  t,
  lastGood,
  params,
  sampleSet,
  commitSet,
  synth,
  locale,
  capabilities,
  hasImageCodec,
  paletteGroups,
  workshop,
}: InsertActionsOptions): InsertActions {
  // Destructured ONCE: the controller object is rebuilt every render, so the
  // memo deps below must be these stable fields, never `editor` itself.
  const { read, selection, apply, applyAll, select } = editor;
  const previewRef = useRef(lastGood);
  previewRef.current = lastGood;

  // Whether a scaffold may name a charset-unsafe field through a declaration
  // instead of degrading (an older engine parse-rejects `bindings:`).
  const canDeclare = capabilities === undefined || capabilities.includes('binding.declarations');
  // The insert menu's element group. Both line rows are capability-gated —
  // against an older engine their snippets would be parse errors rather than
  // drawings, so each row is absent rather than broken: the cut-here rule needs
  // `line`'s `style:`, and the plain rule needs a `Length` endpoint (it spans
  // `100%` of whatever it sits in).
  const insertGroups = insertMenuGroups({
    iterable: iterableAvailable(paletteGroups, workshop),
    image: hasImageCodec,
    field: workshop,
    cutLine: capabilities === undefined || capabilities.includes('line.style'),
    line: capabilities === undefined || capabilities.includes('line.length'),
    ellipse: capabilities === undefined || capabilities.includes('ellipse'),
    checkbox:
      capabilities === undefined ||
      (capabilities.includes('checkbox') && capabilities.includes('checkbox.auto_size')),
    pageBreak: capabilities === undefined || capabilities.includes('page_break'),
    charGrid: capabilities === undefined || capabilities.includes('char_grid'),
  });

  // Insert a default snippet at the resolved target (into the selected
  // container, after the selected item, or appended to the body) and select
  // the new item so the property panel opens on it. A failed op (hostile
  // document shapes) leaves the document and selection untouched.
  const insert = useCallback(
    (kind: InsertKind) => {
      const target = resolveInsertTarget(read, selection);
      const snippet = insertSnippet(kind, t('insert.defaultText'), {
        label: t('insert.cutLine.label'),
        width: contentWidthPt(previewRef.current),
      });
      // A band's children are coordinate-placed against the page margin box,
      // so an insert there ships with coordinates; a flow-body insert stays
      // box-less and auto-sizes.
      const band = bandOf(target.path);
      const result = apply({
        op: 'insertItem',
        path: target.path,
        index: target.index,
        value:
          band === null
            ? snippet
            : bandPlaced(snippet, bandInsertY(band, bandBoxHeightPt(previewRef.current, read))),
      });
      if (result.ok) {
        select(`${target.path}[${target.index}]`);
      }
    },
    [read, selection, apply, select, t],
  );

  const ctx: InsertContext = {
    read,
    selection,
    apply,
    applyAll,
    select,
    t,
    params,
    sampleSet,
    commitSet,
    synth,
    locale,
    canDeclare,
  };

  // One call per scaffold, in a fixed order — the hooks are independent (each
  // owns only its own open flag), so the order is presentation, not a contract.
  const container = useContainerInsert(ctx);
  const iterable = useIterableInsert(ctx);
  const field = useFieldInsert(ctx, workshop);
  const paste = usePasteInsert(ctx);

  return {
    insert,
    insertGroups,
    canDeclare,
    previewRef,
    ...container,
    ...iterable,
    ...field,
    ...paste,
  };
}
