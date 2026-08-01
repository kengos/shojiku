// The AI copilot (host-injected `suggest:ops` provider — absent = feature
// hidden). The prompt dialog forwards the ask; the reply's ops are UNTRUSTED:
// shallow-sanitized (fail-closed, whole-reply refusal) then dry-run through a
// SCRATCH Editor's transactional `applyAll` — only a batch that fully applies
// becomes a proposal, reviewed in the diff pane and applied to the live editor
// as ONE `applyAll` (one undo step, AI parity) on explicit confirm.

import { Editor, type Op } from '@shojiku/designer-core';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { CopilotRunOutcome } from '../copilot/CopilotDialog';
import {
  COPILOT_INSTRUCTIONS,
  type CopilotProvider,
  MAX_COPILOT_NOTE_CHARS,
  sanitizeCopilotOps,
} from '../registry/copilot';

export interface CopilotProposal {
  readonly ops: readonly Op[];
  /** The text the dry-run ran against — confirm re-checks it, because the
   * window ⌘Z shortcut can still change the document behind the modal. */
  readonly baseline: string;
  readonly proposed: string;
  readonly note?: string;
}

export interface CopilotOptions {
  readonly copilot: CopilotProvider | undefined;
  readonly text: string;
  readonly effectiveDefinitions: string | undefined;
  readonly selection: string | null;
  readonly params: string;
  readonly maxBytes: number;
}

export interface Copilot {
  readonly copilotOpen: boolean;
  readonly openCopilot: () => void;
  /** Closing abandons any in-flight run: the epoch bumps, and a result carrying
   * a stale epoch is dropped — a review modal must never pop up after the user
   * cancelled the ask. */
  readonly closeCopilot: () => void;
  readonly copilotProposal: CopilotProposal | null;
  readonly setCopilotProposal: (proposal: CopilotProposal | null) => void;
  readonly copilotNotice: string | null;
  readonly setCopilotNotice: (notice: string | null) => void;
  /** Undefined = no provider injected (the toolbar button stays absent). */
  readonly copilotRun: ((prompt: string) => Promise<CopilotRunOutcome>) | undefined;
}

export function useCopilot({
  copilot,
  text,
  effectiveDefinitions,
  selection,
  params,
  maxBytes,
}: CopilotOptions): Copilot {
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotProposal, setCopilotProposal] = useState<CopilotProposal | null>(null);
  const [copilotNotice, setCopilotNotice] = useState<string | null>(null);
  const copilotEpochRef = useRef(0);
  const copilotRun = useMemo(() => {
    if (copilot === undefined) {
      return undefined;
    }
    return async (prompt: string): Promise<CopilotRunOutcome> => {
      const epoch = copilotEpochRef.current;
      let reply: unknown;
      try {
        reply = await copilot({
          prompt,
          instructions: COPILOT_INSTRUCTIONS,
          template: text,
          definitions: effectiveDefinitions,
          selectionPath: selection ?? undefined,
          params,
        });
      } catch {
        // A transport failure — the generic chrome message only; provider
        // internals never render.
        return { ok: false, error: 'copilot.error.failed' };
      }
      // The reply is integrator-relayed LLM output: re-guard its shape here
      // (the contribution-guard posture) rather than trusting the type.
      const record =
        typeof reply === 'object' && reply !== null
          ? (reply as Record<string, unknown>)
          : undefined;
      const ops = sanitizeCopilotOps(record?.ops);
      if (ops === null) {
        return { ok: false, error: 'copilot.error.invalid' };
      }
      // Deep validation: the SAME transactional apply the confirm will run,
      // against a scratch editor — any refused op refuses the whole batch.
      const probe = Editor.create(text, { maxBytes });
      if (!probe.applyAll(ops).ok) {
        return { ok: false, error: 'copilot.error.refused' };
      }
      const proposed = probe.text();
      // A reply may not balloon the document past the parse cap: the apply
      // itself has no size gate, and an over-cap text would only throw later
      // (an undo/redo re-parse) — refuse it here, fail-closed.
      if (new TextEncoder().encode(proposed).length > maxBytes) {
        return { ok: false, error: 'copilot.error.refused' };
      }
      // The user closed the dialog while the request was in flight: drop the
      // result (the outcome is unread — the dialog unmounted).
      if (epoch !== copilotEpochRef.current) {
        return { ok: true };
      }
      const rawNote = record?.note;
      setCopilotProposal({
        ops,
        baseline: text,
        proposed,
        note: typeof rawNote === 'string' ? rawNote.slice(0, MAX_COPILOT_NOTE_CHARS) : undefined,
      });
      setCopilotOpen(false);
      return { ok: true };
    };
  }, [copilot, text, effectiveDefinitions, selection, params, maxBytes]);

  const openCopilot = useCallback(() => {
    setCopilotNotice(null);
    setCopilotOpen(true);
  }, []);
  const closeCopilot = useCallback(() => {
    copilotEpochRef.current += 1;
    setCopilotOpen(false);
  }, []);

  return {
    copilotOpen,
    openCopilot,
    closeCopilot,
    copilotProposal,
    setCopilotProposal,
    copilotNotice,
    setCopilotNotice,
    copilotRun,
  };
}
