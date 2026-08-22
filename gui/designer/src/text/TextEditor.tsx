// The ONE text-editing component, shared by the property panel's text field and
// the canvas double-click overlay so upgrades land in one place. A
// contenteditable surface over the wire text: `{key}` expressions render as
// atomic labeled chips (built imperatively from the chip model — React renders
// the editable div EMPTY and never reconciles its content), everything else is
// verbatim text nodes, so serialization is an identity recomposition and a
// bare tab-through never rewrites the document. Chips are created only at
// seed time and by the field menus (inserting one, or re-picking a selected
// one's field in place) — hand-typed syntax stays plain text until
// the next commit reseeds (the expert path, and no DOM restructuring can hit a
// live IME composition). A click marks the chip it lands on as SELECTED, which
// is what the replace menu acts on: a chip is `user-select: none`, so it can
// never ride the caret's own selection. Commits on blur leaving the whole
// editor (moving into either field menu is not a commit) or ⌘/Ctrl+Enter,
// only on a CHANGED value;
// Enter inserts a newline; paste is plain-text only; Escape cancels without
// committing when the host provides `onCancel` (the canvas overlay).
//
// The keyboard/ingress behavior itself lives in `text/editorHandlers`; this
// component owns seeding, the commit decision and the staged declarations.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChipFieldMenus } from './ChipFieldMenus';
import type { ChipContext } from './chipContext';
import { buildEditorNodes, CHIP_SELECTED_CLASS, type ChipMeta, serializeEditor } from './chipModel';
import { chipMetaFor, type PendingDecl } from './declModel';
import { EditorSurface } from './EditorSurface';
import { selectAllContent } from './editorDom';
import { type DraftListener, useDraftReporter } from './useDraftReporter';

export interface TextEditorProps {
  readonly value: string;
  /** Called with the new text only when it differs from `value`, together with
   * the declarations the session staged for it — the host applies both as ONE
   * batch, so a cancelled edit can never leave an orphan declaration behind. */
  readonly onCommit: (value: string, declarations: readonly PendingDecl[]) => void;
  /** Escape handler — present on the canvas overlay (close without commit),
   * absent in the panel (Escape stays the field's native no-op). */
  readonly onCancel?: () => void;
  /** Accessible name for the editable surface. The panel's `<label>` wrapper
   * cannot name a contenteditable div, so pass it there too. */
  readonly ariaLabel?: string;
  /** Focus (and select-all) on mount — the canvas overlay opens ready to type;
   * the panel field does not steal focus. */
  readonly autoFocus?: boolean;
  readonly className?: string;
  /** Present when the host can offer binding fields: chips label themselves
   * from its rows and declarations, and the insert menu appears. */
  readonly chips?: ChipContext;
  /** Report the edit IN PROGRESS, so a host can show it before it is committed
   * — `null` withdraws it (commit, cancel, unmount). The property panel needs
   * this because the canvas is its only confirmation channel: without it a
   * reader types and nothing on screen moves until blur, which two independent
   * walkthroughs read as "the app is broken". Omitting the prop means no draft
   * is reported — but it does NOT opt out of the commit-on-unmount below, which
   * is unconditional and changed behaviour for every host. Never fired mid-IME-composition —
   * a Japanese reader would otherwise watch `りょうしゅうしょ` render on the way
   * to `領収書` — one is fired on `compositionend` instead. */
  readonly onDraft?: DraftListener;
}

export function TextEditor({
  value,
  onCommit,
  onCancel,
  ariaLabel,
  autoFocus = false,
  className = 'sj-text-editor',
  chips,
  onDraft,
}: TextEditorProps) {
  const [editorEl, setEditorEl] = useState<HTMLDivElement | null>(null);
  // A cancel unmounts the canvas overlay, and the unmount fires a blur — this
  // flag makes that trailing blur skip the commit so Escape never writes.
  const cancelled = useRef(false);
  // Set once this instance has committed, so the exit path cannot repeat it.
  const committed = useRef(false);
  // The exit behaviour, re-pointed every render so the one-shot unmount effect
  // runs the CURRENT closure (value, pending and the editor element all move).
  const exitRef = useRef<(() => void) | null>(null);
  // Declarations minted by picks in THIS session, handed to the host at commit
  // (the seed is one-shot, so this list never needs clearing: a commit that
  // changes the text reseeds the field by remounting it).
  const [pending, setPending] = useState<readonly PendingDecl[]>([]);
  // The clicked chip, which the field menus re-pick. Held as the node itself:
  // a chip is `user-select: none`, so the caret's own selection can never
  // stand for it.
  const [selected, setSelected] = useState<Element | null>(null);
  const meta = useMemo(
    () =>
      chips === undefined
        ? new Map<string, ChipMeta>()
        : chipMetaFor(chips.options, chips.documentOptions, chips.declared),
    [chips],
  );

  // Seeding data rides refs so the callback ref can stay identity-stable
  // (an inline ref re-attaches every render); the content seeds exactly once.
  const draft = useDraftReporter(onDraft, pending);

  const seedValue = useRef(value);
  seedValue.current = value;
  const seedMeta = useRef(meta);
  seedMeta.current = meta;
  const seeded = useRef(false);
  const seedRef = useCallback((el: HTMLDivElement | null) => {
    setEditorEl(el);
    if (el !== null && !seeded.current) {
      seeded.current = true;
      for (const node of buildEditorNodes(el.ownerDocument, seedValue.current, seedMeta.current)) {
        el.appendChild(node);
      }
    }
  }, []);

  useEffect(() => {
    if (selected === null) {
      return;
    }
    selected.classList.add(CHIP_SELECTED_CLASS);
    return () => selected.classList.remove(CHIP_SELECTED_CLASS);
  }, [selected]);

  useEffect(() => {
    if (autoFocus && editorEl !== null) {
      editorEl.focus();
      selectAllContent(editorEl, document.getSelection());
    }
  }, [autoFocus, editorEl]);

  // The selected chip can leave the document under us, and `keydown` is too
  // early to see it: the browser applies its default action AFTER the handler
  // returns, so typing over a selection that spans the pill, a cut, or a native
  // undo all detach it later. `input` fires after the edit and covers those; our
  // own Range surgery (atomic erosion, paste, drop) fires no `input` at all and
  // calls this directly. Identity-preserving, so the still-attached case costs
  // no re-render.
  const dropDetachedSelection = (el: HTMLElement) => {
    setSelected((chip) => (chip !== null && !el.contains(chip) ? null : chip));
  };

  const commitFrom = (el: HTMLElement) => {
    // Unconditional, and BEFORE the commit: a blur with no change still ends
    // the draft, and the host must drop the overlay before the real edit lands.
    draft.withdraw();
    const next = serializeEditor(el);
    if (next !== value) {
      committed.current = true;
      onCommit(next, pending);
    }
  };

  // Leaving the field is not always a BLUR. Switching the property panel's tab,
  // or moving the selection, unmounts this component while it still holds
  // focus — and the browser fires no blur for a node removed under the caret,
  // so without this the reader's typing is simply discarded. The flags make it
  // exactly-once: a commit that already fired (blur, ⌘Enter — after which the
  // host remounts the field on its new value) must not fire again as a second
  // undo step, and a cancelled edit must never commit at all.
  exitRef.current = () => {
    if (cancelled.current || committed.current || editorEl === null) {
      draft.withdraw();
      return;
    }
    commitFrom(editorEl);
  };
  useEffect(() => () => exitRef.current?.(), []);

  const cancel =
    onCancel === undefined
      ? undefined
      : () => {
          cancelled.current = true;
          draft.withdraw();
          onCancel();
        };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: blur-delegation wrapper for the editing surface; focus and the textbox role live on the contentEditable child.
    <div
      className="sj-text-editor-root"
      onBlur={(event) => {
        // Focus moving within the editor's own chrome (into the insert menu
        // and back) is not a commit; leaving the whole root is.
        const next = event.relatedTarget;
        if (
          cancelled.current ||
          editorEl === null ||
          (next instanceof Node && event.currentTarget.contains(next))
        ) {
          return;
        }
        commitFrom(editorEl);
      }}
    >
      <EditorSurface
        seedRef={seedRef}
        ariaLabel={ariaLabel}
        className={className}
        commit={commitFrom}
        cancel={cancel}
        onSelectChip={setSelected}
        onDetachCheck={dropDetachedSelection}
        draft={draft}
      />
      {chips !== undefined && editorEl !== null ? (
        <ChipFieldMenus
          chips={chips}
          editor={{ el: editorEl, meta, selected }}
          staging={{
            pending,
            onStage: (decl) => setPending((staged) => [...staged, decl]),
          }}
          onReplaced={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
