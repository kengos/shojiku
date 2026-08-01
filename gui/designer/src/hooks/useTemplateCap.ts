// The template-size cap for one editing session: seeded once per mount and
// raised in-session by the image-headroom prompt. Local state drives it (so the
// component works standalone); the seed feeds the editor's parse limit, and a
// raise routes through the editor too, so undo/redo/rollback re-parse under the
// same bound.

import { clampTemplateMaxBytes } from '@shojiku/designer-core';
import { useState } from 'react';

export interface TemplateCap {
  readonly maxBytes: number;
  readonly setMaxBytes: (bytes: number) => void;
}

/** Seed the cap from the host's persisted value, floored at the SOURCE's own
 * byte size: a large (image-bearing) document reopened WITHOUT its matching
 * persisted cap still parses instead of throwing on mount. */
export function useTemplateCap(templateMaxBytes: number | undefined, source: string): TemplateCap {
  const [maxBytes, setMaxBytes] = useState(() =>
    clampTemplateMaxBytes(
      Math.max(clampTemplateMaxBytes(templateMaxBytes), new TextEncoder().encode(source).length),
    ),
  );
  return { maxBytes, setMaxBytes };
}
