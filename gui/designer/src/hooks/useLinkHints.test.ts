// What the shell tells the canvas about the links in the document — and the
// cases where it deliberately tells it nothing.

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BoxIndex, PlacedBox } from '../engine/types';
import { useLinkHints } from './useLinkHints';

const box = (path: string, over: Partial<PlacedBox> = {}): PlacedBox => ({
  path,
  border: { x: 0, y: 0, w: 10, h: 10 },
  content: { x: 0, y: 0, w: 10, h: 10 },
  ...over,
});

const index = (...pages: (readonly PlacedBox[])[]): BoxIndex => ({ pages });

/** A `read` over a tiny document: `a` links out, `b` does not. */
const read = (path: string): unknown =>
  path === 'a' ? { type: 'text', link: { url: 'https://example.com' } } : { type: 'text' };

const t = ((key: string, args?: Record<string, unknown>) =>
  `${key}:${String(args?.url ?? '')}`) as never;

describe('useLinkHints', () => {
  it('carries the destination and the description for each linked box', () => {
    const { result } = renderHook(() =>
      useLinkHints({ boxes: index([box('a', { linked: true })]), read, t, text: 'v1' }),
    );
    expect(result.current?.get('a')).toEqual({
      url: 'https://example.com',
      description: 'canvas.link.description:https://example.com',
    });
  });

  it('is UNDEFINED rather than empty when nothing is linked', () => {
    // The canvas prop then stays absent, which is the documented "unchanged"
    // case — and where a host on an older engine lands, since that engine
    // stamps no `linked` flag at all.
    const { result } = renderHook(() =>
      useLinkHints({ boxes: index([box('b')]), read, t, text: 'v1' }),
    );
    expect(result.current).toBeUndefined();
  });

  it('follows the ENGINE flag, not the document', () => {
    // The engine drops a link whose scheme it refuses or whose URL is over the
    // cap, and the badge already follows what the PDF will contain. A hint on
    // an unstamped item would explain a mark that is not there.
    const { result } = renderHook(() =>
      useLinkHints({ boxes: index([box('a')]), read, t, text: 'v1' }),
    );
    expect(result.current).toBeUndefined();
  });

  it('skips a stamped box the document has no url for', () => {
    const { result } = renderHook(() =>
      useLinkHints({ boxes: index([box('b', { linked: true })]), read, t, text: 'v1' }),
    );
    expect(result.current).toBeUndefined();
  });

  it('counts a repeat’s two placements once — they share one path', () => {
    const { result } = renderHook(() =>
      useLinkHints({
        boxes: index([box('a', { linked: true })], [box('a', { linked: true })]),
        read,
        t,
        text: 'v1',
      }),
    );
    expect(result.current?.size).toBe(1);
  });
});
