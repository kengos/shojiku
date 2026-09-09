// The flow surface: a text item's `spans:` as editable, marked-up runs. The
// sibling of `TextEditor`, not a mode inside it — that component's whole shape
// is "one value in, one string out", and every seed, commit and serialization
// here answers in FRAGMENTS instead.
//
// What it shares with `TextEditor` is the exit behaviour, and it is shared
// because the failure it prevents is the expensive one: leaving the field is
// not always a BLUR. A panel tab switch or a selection change removes the node
// while it still holds focus, and the browser fires no blur for that — so
// without the unmount path the reader's typing is simply discarded.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChipFieldMenus } from './ChipFieldMenus';
import type { ChipContext } from './chipContext';
import type { ChipMeta } from './chipModel';
import type { PendingDecl } from './declModel';
import { chipMetaFor } from './declModel';
import { EditorSurface } from './EditorSurface';
import { keepIfAttached } from './editorDom';
import { RunFormatBar } from './RunFormatBar';
import { applyMarks } from './runFormat';
import { applyShortcut } from './runMarks';
import { buildRunNodes } from './runNodes';
import { type SerializedRun, serializeRuns } from './runSerialize';
import type { RunMarks, RunView } from './spanRuns';
import { useDraftReporter } from './useDraftReporter';
import { useSelectionMarks } from './useSelectionMarks';

export interface SpansFlowEditorProps {
  /** The fragments to seed from. Read ONCE — the surface is uncontrolled after
   * that, exactly as the plain editor is, so a re-render cannot move the caret. */
  readonly runs: readonly RunView[];
  readonly onCommit: (runs: readonly SerializedRun[], declarations: readonly PendingDecl[]) => void;
  readonly onCancel: () => void;
  readonly ariaLabel: string;
  readonly chips?: ChipContext;
  readonly className?: string;
}

export function SpansFlowEditor({
  runs,
  onCommit,
  onCancel,
  ariaLabel,
  chips,
  className = 'sj-text-editor sj-runs',
}: SpansFlowEditorProps) {
  const [editorEl, setEditorEl] = useState<HTMLDivElement | null>(null);
  const cancelled = useRef(false);
  const committed = useRef(false);
  const exitRef = useRef<(() => void) | null>(null);
  // Declarations minted by picks in THIS session, handed to the host at commit.
  // The seed is one-shot, so the list never needs clearing: a commit that
  // changes anything reseeds the surface by remounting it.
  const [pending, setPending] = useState<readonly PendingDecl[]>([]);
  const [selectedChip, setSelectedChip] = useState<Element | null>(null);
  const [meta, setMeta] = useState<ReadonlyMap<string, ChipMeta>>(() => new Map());
  const draft = useDraftReporter(undefined, pending);
  const { marks, refresh } = useSelectionMarks(editorEl);

  // Seeding rides refs so the callback ref stays identity-stable (an inline ref
  // re-attaches every render); the content seeds exactly once.
  const seedRuns = useRef(runs);
  seedRuns.current = runs;
  const seedMeta = useRef(chips);
  seedMeta.current = chips;
  const seeded = useRef(false);
  const seedRef = useCallback((el: HTMLDivElement | null) => {
    setEditorEl(el);
    if (el === null || seeded.current) {
      return;
    }
    seeded.current = true;
    const context = seedMeta.current;
    const table =
      context === undefined
        ? new Map<string, ChipMeta>()
        : chipMetaFor(context.options, context.documentOptions, context.declared);
    setMeta(table);
    for (const node of buildRunNodes(el.ownerDocument, seedRuns.current, table)) {
      el.appendChild(node);
    }
  }, []);

  useEffect(() => {
    editorEl?.focus();
  }, [editorEl]);

  const commitFrom = (el: HTMLElement) => {
    draft.withdraw();
    committed.current = true;
    // Always handed up: whether the fragments actually moved is a question
    // about the DOCUMENT, and the host answers it — an empty op batch is never
    // dispatched, so an unchanged commit still costs no undo step.
    onCommit(serializeRuns(el), pending);
  };

  exitRef.current = () => {
    if (cancelled.current || committed.current || editorEl === null) {
      draft.withdraw();
      return;
    }
    commitFrom(editorEl);
  };
  useEffect(() => () => exitRef.current?.(), []);

  const mark = (next: (current: RunMarks) => RunMarks) => {
    if (editorEl !== null && applyMarks(editorEl, editorEl.ownerDocument.getSelection(), next)) {
      refresh();
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: blur-delegation wrapper for the editing surface; focus and the textbox role live on the contentEditable child.
    <div
      className="sj-text-editor-root"
      onBlur={(event) => {
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
      onKeyUp={refresh}
      onMouseUp={refresh}
    >
      <RunFormatBar marks={marks} onMark={mark}>
        {/* The insert trigger, on the bar beside the marks. A bound value is
            authored as a `{key}` CHIP inside a fragment's text, never as a new
            `data:` fragment (the user's decision) — so the affordance belongs
            where the other text-level ones are, not on the panel. */}
        {chips === undefined || editorEl === null ? null : (
          <ChipFieldMenus
            chips={chips}
            editor={{ el: editorEl, meta, selected: selectedChip }}
            staging={{
              pending,
              onStage: (decl) => setPending((staged) => [...staged, decl]),
            }}
            onReplaced={() => setSelectedChip(null)}
          />
        )}
      </RunFormatBar>
      <EditorSurface
        seedRef={seedRef}
        ariaLabel={ariaLabel}
        className={className}
        commit={commitFrom}
        cancel={() => {
          cancelled.current = true;
          draft.withdraw();
          onCancel();
        }}
        // ⌘B / ⌘I / ⌘U reach the SAME mark the bar applies, through the one
        // keydown rule both surfaces share — so the shortcut and the button
        // cannot come to mean different things.
        format={(shortcut) => mark((current) => applyShortcut(shortcut, current, marks))}
        // A `{key}` inside a fragment's TEXT is still a chip, and the same
        // click/detach bookkeeping the plain surface does applies here: the
        // node the re-pick menu names can leave the document under us.
        onSelectChip={setSelectedChip}
        onDetachCheck={(el) => setSelectedChip((chip) => keepIfAttached(el, chip))}
        draft={draft}
      />
    </div>
  );
}
