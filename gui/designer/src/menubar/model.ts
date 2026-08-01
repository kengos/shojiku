// Pure model for the Google-Docs-style menubar: it assembles the top-level
// menu columns (File / Edit / Insert) from primitive wiring the Designer holds,
// and validates UNTRUSTED host-supplied menu entries. Framework-free (like
// insert/model.ts) so every branch is exhaustively unit-testable; the Menubar
// component stays thin over it. Menu items dispatch EXISTING ops/host callbacks
// only — each item carries a `run` closure the Designer built, never a new
// document mutation path (AI parity holds). A host entry carries its OWN `run`
// function reference, so the component never looks an id up in a table (no
// prototype-walk surface) — that validation is `hostEntries.ts`, and the
// per-entry-kind insert dispatch is `insertItems.ts`.

import type { InsertGroup, InsertKind } from '../insert/insertMenu';
import type { HostMenuEntry } from './hostEntries';
import { insertItems } from './insertItems';

export type { HostMenuEntry, RawHostMenuEntry } from './hostEntries';
export {
  MAX_HOST_MENU_ENTRIES,
  MAX_MENU_ID_LEN,
  MAX_MENU_LABEL_LEN,
  validateHostEntries,
} from './hostEntries';

/** One menu row: a localized label + the closure it dispatches. `disabled`
 * greys it out (undo with an empty stack). */
export interface MenuItem {
  readonly label: string;
  readonly run: () => void;
  readonly disabled?: boolean;
}

/** One top-level menu (File / Edit / Insert): a stable identifier-safe `id`
 * (React keys / aria), a localized trigger `label`, and item groups separated
 * by dividers. Only NON-EMPTY groups are ever present. */
export interface MenuColumn {
  readonly id: string;
  readonly label: string;
  readonly groups: readonly (readonly MenuItem[])[];
}

/** The primitive wiring the Designer holds; `buildMenubar` turns it into the
 * rendered columns. Every callback is an EXISTING op/host callback — the model
 * only decides which items appear and how they group. */
export interface MenubarWiring {
  /** File — host/file actions; each optional action's item appears only when
   * the host injected it (the imageCodec/picker gate precedent). `onSave` is
   * always present (the Designer's own validate-then-save). */
  readonly onBack?: () => void;
  readonly onOpen?: () => void;
  readonly onExport?: () => void;
  /** Render + show the real PDF. Present only when the engine advertises
   * `wasm.render.pdf` AND the transport implements it — the Designer resolves
   * both before wiring, so this stays a plain presence check here. */
  readonly onPdf?: () => void;
  readonly onAddFont?: () => void;
  /** Open the named restore-points dialog (host-owned local persistence) —
   * present only when the host wires it, like the other file actions. */
  readonly onSnapshots?: () => void;
  readonly onSave: () => void;
  /** Open the fullscreen document-settings view (page/defaults/styles/locale) —
   * always present (the view is built-in Designer chrome, like Save). */
  readonly onDocumentSettings: () => void;
  /** Open the fullscreen data-item editor (definitions + sample data) — always
   * present, the second entry point beside the data-items tab's gear. */
  readonly onDataEditor: () => void;
  /** Validated host-extension entries (appended as a divided group). */
  readonly hostEntries: readonly HostMenuEntry[];
  /** Edit — undo/redo (disabled when their stack is empty) + the
   * selection-gated duplicate/delete (present only when a sequence item is
   * selected). */
  readonly onUndo: () => void;
  readonly canUndo: boolean;
  readonly onRedo: () => void;
  readonly canRedo: boolean;
  readonly onDuplicate?: () => void;
  readonly onDelete?: () => void;
  /** Insert — the armed insert groups (elements always, list-data/image when
   * armed) + the dispatch handlers per entry kind. */
  readonly insert: readonly InsertGroup[];
  readonly onInsertKind: (kind: InsertKind) => void;
  readonly onContainer: () => void;
  readonly onIterable: () => void;
  readonly onField: () => void;
  readonly onImage: () => void;
  readonly onPaste: () => void;
  /** Reusable blocks — save the selection as a block (disabled without a savable
   * selection), insert a saved block by id, open the manage dialog. Present only
   * when the host armed block persistence (the group is otherwise not built). */
  readonly onSaveBlock: () => void;
  readonly onInsertBlock: (id: string) => void;
  readonly onManageBlocks: () => void;
  /** Whether the current selection is a single node that can become a block —
   * gates the save-selection row (the band-only-row precedent). */
  readonly blockSavable: boolean;
  /** Whether the current insert target is a header/footer band — the gate for
   * band-only rows. */
  readonly bandTarget: boolean;
  /** Help — shortcuts, glossary and the tutorial are all self-contained
   * Designer chrome, always present. */
  readonly onShortcuts: () => void;
  readonly onGlossary: () => void;
  readonly onTutorial: () => void;
}

/** Assemble the File / Edit / Insert columns. Every column is always non-empty
 * (File has Save, Edit has undo/redo, Insert has the element group), so no
 * column is dropped; only the optional host group and the selection-gated
 * duplicate/delete items are conditional. The deferred menus (View / Format /
 * Data) are populated by their owning redesign items and are simply not built
 * here. */
export function buildMenubar(t: (key: string) => string, w: MenubarWiring): MenuColumn[] {
  const fileMain: MenuItem[] = [];
  if (w.onBack !== undefined) {
    fileMain.push({ label: t('menu.back'), run: w.onBack });
  }
  if (w.onOpen !== undefined) {
    fileMain.push({ label: t('menu.open'), run: w.onOpen });
  }
  if (w.onExport !== undefined) {
    fileMain.push({ label: t('menu.export'), run: w.onExport });
  }
  if (w.onPdf !== undefined) {
    fileMain.push({ label: t('menu.pdf'), run: w.onPdf });
  }
  if (w.onAddFont !== undefined) {
    fileMain.push({ label: t('menu.addFont'), run: w.onAddFont });
  }
  if (w.onSnapshots !== undefined) {
    fileMain.push({ label: t('menu.snapshots'), run: w.onSnapshots });
  }
  fileMain.push({ label: t('app.save'), run: w.onSave });
  fileMain.push({ label: t('menu.documentSettings'), run: w.onDocumentSettings });
  fileMain.push({ label: t('menu.dataEditor'), run: w.onDataEditor });
  const fileGroups: MenuItem[][] = [fileMain];
  if (w.hostEntries.length > 0) {
    fileGroups.push(w.hostEntries.map((e) => ({ label: e.label, run: e.run })));
  }

  const editMain: MenuItem[] = [
    { label: t('app.undo'), run: w.onUndo, disabled: !w.canUndo },
    { label: t('app.redo'), run: w.onRedo, disabled: !w.canRedo },
  ];
  const editSelection: MenuItem[] = [];
  if (w.onDuplicate !== undefined) {
    editSelection.push({ label: t('menu.duplicate'), run: w.onDuplicate });
  }
  if (w.onDelete !== undefined) {
    editSelection.push({ label: t('menu.delete'), run: w.onDelete });
  }
  const editGroups: MenuItem[][] = [editMain];
  if (editSelection.length > 0) {
    editGroups.push(editSelection);
  }

  const insertGroups = w.insert.map((group) => insertItems(t, group, w));

  const helpMain: MenuItem[] = [
    { label: t('menu.help.tutorial'), run: w.onTutorial },
    { label: t('shortcuts.title'), run: w.onShortcuts },
    { label: t('glossary.title'), run: w.onGlossary },
  ];

  return [
    { id: 'file', label: t('menu.file'), groups: fileGroups },
    { id: 'edit', label: t('menu.edit'), groups: editGroups },
    { id: 'insert', label: t('app.insert'), groups: insertGroups },
    { id: 'help', label: t('menu.help'), groups: [helpMain] },
  ];
}
