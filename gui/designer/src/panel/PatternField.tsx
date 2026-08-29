// Writing a date/datetime PATTERN. Picking is safe and typing is dangerous, so
// the surface is built the other way round from a plain text field: the TOKENS
// come first as chips that each show their own rendered output and INSERT
// themselves when pressed, and the raw pattern string sits under them.
//
// The raw string stays editable (user decision): making it read-only would
// remove the typing risk structurally, but it would also strand every pattern
// an existing document already holds — a pattern that mixes literals does not
// decompose back into a chip row.
//
// Nothing here formats. Every string on screen — each chip's output and the
// live line — is the ENGINE rendering its own fixed exemplar instant through
// the same dispatch a real binding takes.

import { useEffect, useRef, useState } from 'react';
import type { PatternProbe, ProbeResult } from '../engine/types';
import { usePatternPreview } from '../hooks/usePatternPreview';
import { useI18n } from '../i18n/context';
import { FIELD_LABEL, INPUT } from '../ui/chrome';

export interface PatternFieldProps {
  readonly label: string;
  readonly fieldType: 'date' | 'datetime';
  /** The pattern as the DOCUMENT holds it — the field reseeds from this. */
  readonly value: string;
  readonly probe: (probes: readonly PatternProbe[]) => Promise<readonly ProbeResult[]>;
  /** Commit the edited pattern — on blur, and immediately on a chip insert.
   * A caller that writes to the DOCUMENT wants exactly this: one op per edit,
   * not one per keystroke. An EMPTY pattern still arrives here; refusing it is
   * the caller's op builder's job. */
  readonly onCommit: (pattern: string) => void;
  /** Every keystroke, for a caller holding a form DRAFT rather than writing to
   * the document. Without it a Save clicked straight from the field would read
   * the pre-blur value. */
  readonly onChange?: (pattern: string) => void;
}

const CHIP =
  'inline-flex items-baseline gap-1 rounded-md border border-border bg-surface px-1.5 py-0.5 text-text';

export function PatternField({
  label,
  fieldType,
  value,
  probe,
  onCommit,
  onChange,
}: PatternFieldProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value);
  // Where the caret last was in the field. `null` until the field has been
  // touched, which is exactly when appending at the end is what an author
  // means by pressing a chip.
  const caret = useRef<number | null>(null);
  // The document is the source of truth: an undo, or an edit from elsewhere,
  // reseeds the field rather than leaving a stale draft on screen.
  useEffect(() => {
    setDraft(value);
  }, [value]);
  const preview = usePatternPreview(fieldType, draft, probe);

  // A chip inserts AT THE CARET, so a token can be added mid-pattern rather
  // than only at the end — which is what repairing an existing pattern needs.
  const insert = (token: string) => {
    const at = caret.current ?? draft.length;
    const next = `${draft.slice(0, at)}${token}${draft.slice(at)}`;
    caret.current = at + token.length;
    setDraft(next);
    onChange?.(next);
    onCommit(next);
  };

  return (
    <div className="mb-2">
      <p className={FIELD_LABEL}>{label}</p>
      <div className="mb-1 flex flex-wrap gap-1">
        {preview.tokens.map((entry) => (
          <button
            key={entry.token}
            type="button"
            className={CHIP}
            onClick={() => insert(entry.token)}
            aria-label={t('format.pattern.insert', { token: entry.token })}
          >
            <code className="text-sm">{entry.token}</code>
            <span className="text-sm text-muted italic">{entry.sample}</span>
          </button>
        ))}
      </div>
      <input
        type="text"
        className={`${INPUT} font-mono`}
        value={draft}
        aria-label={label}
        onSelect={(event) => {
          caret.current = event.currentTarget.selectionStart;
        }}
        onChange={(event) => {
          caret.current = event.currentTarget.selectionStart;
          setDraft(event.currentTarget.value);
          onChange?.(event.currentTarget.value);
        }}
        onBlur={() => {
          if (draft !== value) {
            onCommit(draft);
          }
        }}
      />
      {/* Four states, not two. A REFUSED probe comes back with an empty
          sample, so without its own branch it falls into the "nothing typed
          yet" prompt and tells an author who has just typed a very long
          pattern to type one. The refusal is not a degradation of the render —
          nothing was rendered — so it replaces the preview line rather than
          sitting under it.

          Any refusal reads as too-long here on purpose: the surface probes the
          pattern plus `PATTERN_TOKENS`, which is well under the engine's probe
          cap, so `tooManyProbes` cannot arise from it (pinned by a test). A
          two-arm switch would carry a permanently unreachable branch instead
          of a checked assumption. The copy carries no NUMBER — the cap belongs
          to the engine, and a figure repeated here would be a second copy of
          it with nothing keeping the two equal.

          The fourth is UNAVAILABLE — the probe answered nothing at all, so
          there are no chips above and typing changes nothing. It reads as
          information rather than as an error: a transport without the catalog
          query is a documented degraded state, not a fault. What it must not
          do is fall into the empty prompt, which would tell an author to press
          token buttons that are not on screen. It is checked BEFORE the
          sample and AFTER the refusal — a refusal is an answer. */}
      {preview.refused === null ? (
        <p className="mt-0.5 mb-0 text-sm text-muted">
          {preview.unavailable ? (
            t('format.pattern.unavailable')
          ) : preview.sample.length > 0 ? (
            <>
              {t('format.pattern.preview')}{' '}
              <span className="text-text italic">{preview.sample}</span>
            </>
          ) : (
            t('format.pattern.previewEmpty')
          )}
        </p>
      ) : (
        <output className="mt-0.5 block rounded-md bg-error-bg px-2 py-0.5 text-sm text-error-text">
          {t('format.pattern.refused')}
        </output>
      )}
      {preview.warning === null ? null : (
        <output className="mt-0.5 block rounded-md bg-error-bg px-2 py-0.5 text-sm text-error-text">
          {preview.warning}
        </output>
      )}
    </div>
  );
}
