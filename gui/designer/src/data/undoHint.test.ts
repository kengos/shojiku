// The undo control's description names a rename (old → new) or a delete, and
// says nothing for a plain edit.

import { describe, expect, it } from 'vitest';
import { undoHint } from './undoHint';

const t = (key: string, args?: Record<string, string>) => `${key} ${JSON.stringify(args ?? {})}`;

describe('undoHint', () => {
  it('names a rename by its old and new data names', () => {
    expect(undoHint({ kind: 'rename', keysPath: ['properties', 'grand'], name: 'total' }, t)).toBe(
      'data.undoHint.rename {"from":"total","to":"grand"}',
    );
  });

  it('names a delete by the deleted data name, and a plain edit not at all', () => {
    expect(undoHint({ kind: 'delete', name: 'memo', variants: [] }, t)).toBe(
      'data.undoHint.delete {"name":"memo"}',
    );
    expect(undoHint(undefined, t)).toBeUndefined();
  });
});
