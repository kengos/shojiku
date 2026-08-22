import { MAX_TEMPLATE_BYTES } from '@shojiku/designer-core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDraftPreview } from './useDraftPreview';

const SOURCE = [
  'version: "0.1.0"',
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        text: テキスト',
  '',
].join('\n');

const AT = 'sections.body.items[0]';

function setText(value: string) {
  return [{ op: 'setScalar', path: AT, keys: ['text'], value }] as const;
}

describe('useDraftPreview', () => {
  it('renders the committed text until an edit is published', () => {
    const { result } = renderHook(() => useDraftPreview(SOURCE, MAX_TEMPLATE_BYTES));
    expect(result.current.text).toBe(SOURCE);
    expect(result.current.drafting).toBe(false);
  });

  it('renders the pending edit, and reports that it is NOT the committed document', async () => {
    const { result } = renderHook(() => useDraftPreview(SOURCE, MAX_TEMPLATE_BYTES));
    act(() => result.current.setDraftOps(setText('領収書')));
    // Debounced: the derivation is a full re-parse, so it waits for the typing
    // to settle rather than running per keystroke.
    expect(result.current.text).toBe(SOURCE);
    await waitFor(() => expect(result.current.text).toContain('領収書'));
    expect(result.current.drafting).toBe(true);
  });

  it('withdraws back to the committed text IMMEDIATELY — an ended edit is not debounced', async () => {
    const { result } = renderHook(() => useDraftPreview(SOURCE, MAX_TEMPLATE_BYTES));
    act(() => result.current.setDraftOps(setText('領収書')));
    await waitFor(() => expect(result.current.drafting).toBe(true));
    act(() => result.current.setDraftOps(null));
    expect(result.current.text).toBe(SOURCE);
    expect(result.current.drafting).toBe(false);
  });

  it('is NOT drafting when the edit reproduces the committed text', async () => {
    // Retyping the same value must not cost the session its freshness — and it
    // must not hand the render loop a new string, which would re-render for
    // nothing.
    const { result } = renderHook(() => useDraftPreview(SOURCE, MAX_TEMPLATE_BYTES));
    act(() => result.current.setDraftOps(setText('テキスト')));
    await waitFor(() => expect(result.current.text).toBe(SOURCE));
    expect(result.current.drafting).toBe(false);
  });

  it('falls back to the committed text when the edit cannot be derived', async () => {
    const { result } = renderHook(() => useDraftPreview(SOURCE, MAX_TEMPLATE_BYTES));
    act(() =>
      result.current.setDraftOps([
        { op: 'setScalar', path: 'sections.body.items[9]', keys: ['text'], value: 'x' },
      ]),
    );
    await waitFor(() => expect(result.current.text).toBe(SOURCE));
    expect(result.current.drafting).toBe(false);
  });

  it('re-derives against the NEW committed text when the document moves under it', async () => {
    // A sibling field committing mid-draft changes the source; a draft still
    // derived from the old one would render the sibling's edit away.
    const moved = SOURCE.replace('type: flow', 'type: flow\n    gap: 4');
    const { result, rerender } = renderHook(
      ({ source }) => useDraftPreview(source, MAX_TEMPLATE_BYTES),
      { initialProps: { source: SOURCE } },
    );
    act(() => result.current.setDraftOps(setText('領収書')));
    await waitFor(() => expect(result.current.drafting).toBe(true));
    rerender({ source: moved });
    expect(result.current.text).toContain('領収書');
    expect(result.current.text).toContain('gap: 4');
  });
});
