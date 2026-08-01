// The two review panes and the copilot ask dialog: the save/export review the
// File menu opens, and the copilot's dry-run proposal. Both confirm paths are
// fail-closed against a document that moved while the pane was open.

import { CopilotDialog } from '../copilot/CopilotDialog';
import type { EditorController } from '../editor/useEditor';
import type { Copilot } from '../hooks/useCopilot';
import type { SaveFlow } from '../hooks/useSaveFlow';
import { SaveReviewModal } from '../review/SaveReviewModal';

export interface ReviewSurfacesProps {
  readonly save: SaveFlow;
  readonly copilot: Copilot;
  readonly text: string;
  readonly applyAll: EditorController['applyAll'];
}

export function ReviewSurfaces({ save, copilot, text, applyAll }: ReviewSurfacesProps) {
  const { review, baselineText } = save;
  const { copilotProposal, copilotRun } = copilot;
  return (
    <>
      {review === null ? null : (
        <SaveReviewModal
          open
          mode={review.mode}
          baseline={baselineText}
          current={text}
          onConfirm={() => {
            const { run } = review;
            save.setReview(null);
            void run();
          }}
          onClose={() => save.setReview(null)}
        />
      )}
      {copilotRun !== undefined && copilot.copilotOpen ? (
        <CopilotDialog onClose={copilot.closeCopilot} onRun={copilotRun} />
      ) : null}
      {copilotProposal === null ? null : (
        <SaveReviewModal
          open
          mode="copilot"
          baseline={copilotProposal.baseline}
          current={copilotProposal.proposed}
          note={copilotProposal.note}
          onConfirm={() => {
            const proposal = copilotProposal;
            copilot.setCopilotProposal(null);
            // The window ⌘Z shortcut still fires behind the modal (its target
            // guard sees a button, not an editable) — a document that moved
            // since the dry-run refuses rather than applying ops against text
            // they were never validated on.
            if (text !== proposal.baseline) {
              copilot.setCopilotNotice('copilot.error.stale');
              return;
            }
            // A proposal whose ops change nothing (the ask was already so)
            // applies nothing — no empty undo step.
            if (proposal.proposed !== proposal.baseline) {
              applyAll(proposal.ops);
            }
          }}
          onClose={() => copilot.setCopilotProposal(null)}
        />
      )}
    </>
  );
}
