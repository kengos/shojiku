// Creating `spans:` from a plain `text:` item, on a REAL editor. The cases that
// carry the decision are the no-op ones — an unmarked edit must leave the item
// a plain `text:` item, and an unchanged one must author nothing — because
// coverage cannot see an op that was correctly never built.

import { Editor, type Op } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { PendingDecl } from '../text/declModel';
import type { SerializedRun } from '../text/runSerialize';
import { NO_MARKS, type RunMarks } from '../text/spanRuns';
import {
  combineOffered,
  conversionCauses,
  plainFlowCommitOps,
  plainRun,
  spansAuthorable,
  verticalBlock,
} from './spanConversion';

const PATH = 'sections.body.items[0]';

function editorOf(item: string, extra = ''): Editor {
  return Editor.create(`${extra}sections:\n  body:\n    type: flow\n    items:\n      - ${item}\n`);
}

function textRun(content: string, marks: RunMarks = NO_MARKS): SerializedRun {
  return { sourceIndex: 0, kind: 'text', content, marks, linked: false };
}

const BOLD: RunMarks = { ...NO_MARKS, bold: true };

function attempt(
  editor: Editor,
  oldText: string,
  runs: readonly SerializedRun[],
  pending: readonly PendingDecl[] = [],
): readonly Op[] | null {
  return plainFlowCommitOps({ read: (p) => editor.read(p), path: PATH, oldText, runs, pending });
}

/** A commit that is NOT refused — the batch itself. */
function commit(
  editor: Editor,
  oldText: string,
  runs: readonly SerializedRun[],
  pending: readonly PendingDecl[] = [],
): readonly Op[] {
  const ops = attempt(editor, oldText, runs, pending);
  if (ops === null) {
    throw new Error('refused');
  }
  return ops;
}

describe('plainRun', () => {
  it('seeds the whole text as ONE unmarked fragment', () => {
    expect(plainRun('a\nb')).toEqual({
      index: 0,
      kind: 'text',
      content: 'a\nb',
      marks: NO_MARKS,
      hasStyleNames: false,
      linked: false,
    });
  });
});

describe('plainFlowCommitOps — nothing marked', () => {
  it('authors NOTHING for an unchanged edit', () => {
    const editor = editorOf('{ type: text, text: hi }');
    expect(commit(editor, 'hi', [textRun('hi')])).toEqual([]);
  });

  it('writes `text:` exactly as the plain editor would, and never `spans:`', () => {
    const editor = editorOf('{ type: text, text: hi }');
    expect(editor.applyAll(commit(editor, 'hi', [textRun('hi'), textRun(' there')])).ok).toBe(true);
    expect(editor.read(PATH)).toEqual({ type: 'text', text: 'hi there' });
  });
});

describe('plainFlowCommitOps — a mark on NO text', () => {
  it('stays a plain `text:` edit when the only marked fragment is empty', () => {
    // Bold a word, then delete it: the emptied element can keep its mark.
    const editor = editorOf('{ type: text, text: hello }');
    const ops = commit(editor, 'hello', [textRun('hello '), textRun('', BOLD)]);
    expect(editor.applyAll(ops).ok).toBe(true);
    expect(editor.read(PATH)).toEqual({ type: 'text', text: 'hello ' });
  });
});

describe('plainFlowCommitOps — more fragments than the engine draws', () => {
  it('REFUSES the conversion (null) rather than let the engine drop the tail', () => {
    const editor = editorOf('{ type: text, text: x }');
    const runs = Array.from({ length: 257 }, (_, i) =>
      textRun(`w${i}`, i % 2 === 0 ? BOLD : NO_MARKS),
    );
    expect(attempt(editor, 'x', runs)).toBeNull();
    // At the cap itself it converts.
    expect(attempt(editor, 'x', runs.slice(0, 256))).not.toBeNull();
  });
});

describe('plainFlowCommitOps — something marked', () => {
  it('converts in ONE batch: the fragments as `spans:`, the `text:` removed', () => {
    const editor = editorOf('{ type: text, text: hi there }');
    const ops = commit(editor, 'hi there', [textRun('hi '), textRun('there', BOLD)]);
    expect(editor.applyAll(ops).ok).toBe(true);
    expect(editor.read(PATH)).toEqual({
      type: 'text',
      spans: [{ text: 'hi ' }, { text: 'there', style: { fontWeight: 'bold' } }],
    });
    // One undo restores the plain item.
    expect(editor.undo()).toBe(true);
    expect(editor.read(PATH)).toEqual({ type: 'text', text: 'hi there' });
  });

  it('keeps everything else on the item where it was', () => {
    const editor = editorOf(
      '{ type: text, text: 東京, ruby: [{ base: 東京, text: とうきょう }], mark: {}, link: { url: "https://example.com" }, style: { fontSize: 12 } }',
    );
    expect(editor.applyAll(commit(editor, '東京', [textRun('東京', BOLD)])).ok).toBe(true);
    expect(editor.read(PATH)).toMatchObject({
      ruby: [{ base: '東京', text: 'とうきょう' }],
      mark: {},
      link: { url: 'https://example.com' },
      style: { fontSize: 12 },
      spans: [{ text: '東京', style: { fontWeight: 'bold' } }],
    });
    expect(Object.hasOwn(editor.read(PATH) as object, 'text')).toBe(false);
  });

  it('drops EMPTY fragments, and writes a tate-chu-yoko token', () => {
    const editor = editorOf('{ type: text, text: "令和6年" }');
    const runs = [
      textRun('令和'),
      textRun(''),
      textRun('6', { ...NO_MARKS, combine: 'all' }),
      textRun('年'),
    ];
    expect(editor.applyAll(commit(editor, '令和6年', runs)).ok).toBe(true);
    expect((editor.read(PATH) as { spans: unknown }).spans).toEqual([
      { text: '令和' },
      { text: '6', style: { textCombineUpright: 'all' } },
      { text: '年' },
    ]);
  });

  it('does not try to remove a `text:` the item does not carry', () => {
    // An item whose text is empty has no key; an unguarded removal would refuse
    // the whole batch.
    const editor = editorOf('{ type: text }');
    const ops = commit(editor, '', [textRun('new', BOLD)]);
    expect(ops.some((op) => op.op === 'removeKey')).toBe(false);
    expect(editor.applyAll(ops).ok).toBe(true);
  });

  it('writes a bound fragment back as what it is', () => {
    const editor = editorOf('{ type: text, text: x }');
    const bound: SerializedRun = {
      sourceIndex: null,
      kind: 'bound',
      content: 'order.total',
      marks: BOLD,
      linked: false,
    };
    expect(editor.applyAll(commit(editor, 'x', [bound])).ok).toBe(true);
    expect((editor.read(PATH) as { spans: unknown }).spans).toEqual([
      { data: { key: 'order.total' }, style: { fontWeight: 'bold' } },
    ]);
  });

  it('keeps a declaration a fragment still references, and mints a staged one', () => {
    const editor = editorOf(
      '{ type: text, text: "{a} {b}", bindings: { a: { key: x.a }, b: { key: x.b } } }',
    );
    const pending: PendingDecl[] = [{ name: 'c', key: 'x.c', scope: null }];
    const ops = commit(editor, '{a} {b}', [textRun('{a} ', BOLD), textRun('{c}')], pending);
    // A conversion touches the item's content keys and its declarations, nothing else.
    expect(new Set(ops.map((op) => ('keys' in op ? op.keys[0] : '')))).toEqual(
      new Set(['spans', 'text', 'bindings']),
    );
    expect(editor.applyAll(ops).ok).toBe(true);
    const bindings = (editor.read(PATH) as { bindings: Record<string, unknown> }).bindings;
    expect(Object.keys(bindings).sort()).toEqual(['a', 'c']);
  });
});

describe('the open and offer predicates', () => {
  it('authors spans on an engine declaring them — and, vertically, rendering them vertically', () => {
    expect(spansAuthorable(undefined, true)).toBe(true);
    expect(spansAuthorable(['text.spans'], false)).toBe(true);
    expect(spansAuthorable(['text.spans'], true)).toBe(false);
    expect(spansAuthorable(['text.spans', 'style.writingMode.surfaces'], true)).toBe(true);
    expect(spansAuthorable(['style.writingMode.surfaces'], false)).toBe(false);
  });

  it('offers tate-chu-yoko while vertical, or while a fragment carries one', () => {
    const plain = [plainRun('12')];
    const carrying = [{ ...plainRun('12'), marks: { ...NO_MARKS, combine: 'digits2' } }];
    expect(combineOffered(undefined, true, plain)).toBe(true);
    expect(combineOffered(undefined, false, plain)).toBe(false);
    expect(combineOffered(undefined, false, carrying)).toBe(true);
    expect(combineOffered(['style.writingMode.surfaces'], true, plain)).toBe(false);
    expect(combineOffered(['style.textCombineUpright.all'], true, plain)).toBe(false);
  });

  it('reads the block as vertical through the cascade', () => {
    const own = editorOf('{ type: text, text: x, style: { writingMode: vertical_rl } }');
    expect(verticalBlock((p) => own.read(p), PATH)).toBe(true);
    const inherited = editorOf(
      '{ type: text, text: x }',
      'defaults:\n  style:\n    writingMode: vertical_rl\n',
    );
    expect(verticalBlock((p) => inherited.read(p), PATH)).toBe(true);
    const plain = editorOf('{ type: text, text: x }');
    expect(verticalBlock((p) => plain.read(p), PATH)).toBe(false);
  });
});

describe('conversionCauses', () => {
  const causes = (editor: Editor, path = PATH) => conversionCauses((p) => editor.read(p), path);

  it('names nothing for a plain absolutely-placed text', () => {
    expect(causes(editorOf('{ type: text, text: x, box: { x: 0, y: 0, w: 10 } }'))).toEqual([]);
  });

  it("names the item's OWN overflow value — shrink or ellipsis — own or through a named style", () => {
    for (const value of ['shrink', 'ellipsis']) {
      expect(
        causes(editorOf(`{ type: text, text: x, style: { textOverflow: ${value} } }`)),
      ).toEqual([value]);
    }
    const named = editorOf(
      '{ type: text, text: x, styleNames: [fit] }',
      'styles:\n  fit:\n    textOverflow: shrink\n',
    );
    expect(causes(named)).toEqual(['shrink']);
    expect(causes(editorOf('{ type: text, text: x, style: { textOverflow: clip } }'))).toEqual([]);
  });

  it('names hanging punctuation on a horizontal block only', () => {
    expect(
      causes(editorOf('{ type: text, text: x, style: { hangingPunctuation: allow_end } }')),
    ).toEqual(['hanging']);
    expect(
      causes(editorOf('{ type: text, text: x, style: { hangingPunctuation: none } }')),
    ).toEqual([]);
    expect(
      causes(
        editorOf(
          '{ type: text, text: x, style: { hangingPunctuation: force_end, writingMode: vertical_rl } }',
        ),
      ),
    ).toEqual([]);
  });

  describe('the measured width', () => {
    function inContainer(box: string, child: string): Editor {
      return editorOf(`{ type: container, box: ${box}, items: [${child}] }`);
    }
    const CHILD = `${PATH}.items[0]`;

    it('names a widthless child of a ROW', () => {
      expect(causes(inContainer('{ direction: row }', '{ type: text, text: x }'), CHILD)).toEqual([
        'width',
      ]);
    });

    it('does not name a row child with its own width, a zero basis, or a position', () => {
      for (const child of [
        '{ type: text, text: x, box: { w: 40 } }',
        '{ type: text, text: x, box: { flexBasis: 0 } }',
        '{ type: text, text: x, box: { x: 0, y: 0 } }',
      ]) {
        expect(causes(inContainer('{ direction: row }', child), CHILD), child).toEqual([]);
      }
    });

    it('does not name a child of a COLUMN, which sizes across, not from its text', () => {
      expect(causes(inContainer('{}', '{ type: text, text: x }'), CHILD)).toEqual([]);
    });

    it('names a text NESTED in widthless containers that a row or an auto column measures', () => {
      const deep = `${PATH}.items[0].items[0]`;
      expect(
        causes(
          inContainer(
            '{ direction: row }',
            '{ type: container, items: [{ type: text, text: x }] }',
          ),
          deep,
        ),
      ).toEqual(['width']);
      expect(
        causes(
          inContainer(
            '{ type: grid, columns: [auto] }',
            '{ type: container, items: [{ type: text, text: x }] }',
          ),
          deep,
        ),
      ).toEqual(['width']);
      // A row child with basis 0 is not measured by THAT row — but the climb
      // continues, and a column all the way up measures nothing.
      expect(
        causes(
          inContainer(
            '{}',
            '{ type: container, box: { direction: row }, items: [{ type: text, text: x, box: { flexBasis: 0 } }] }',
          ),
          deep,
        ),
      ).toEqual([]);
      // A container with its own width stops the climb.
      expect(
        causes(
          inContainer(
            '{ direction: row }',
            '{ type: container, box: { w: 80 }, items: [{ type: text, text: x }] }',
          ),
          deep,
        ),
      ).toEqual([]);
      // A grid is not measured THROUGH: a text in a grid inside a row is the grid's question.
      expect(
        causes(
          inContainer(
            '{ direction: row }',
            '{ type: container, box: { type: grid, columns: [1fr] }, items: [{ type: text, text: x }] }',
          ),
          deep,
        ),
      ).toEqual([]);
    });

    it('does not name a text outside any `items` list — a table column cell', () => {
      const editor = editorOf(
        '{ type: table, data: { key: rows }, columns: [{ label: A, cell: { type: text, text: x } }] }',
      );
      expect(causes(editor, `${PATH}.columns[0].cell`)).toEqual([]);
    });

    it('does not name a VERTICAL text — the engine measures no vertical block', () => {
      expect(
        causes(
          inContainer(
            '{ direction: row }',
            '{ type: text, text: x, style: { writingMode: vertical_rl } }',
          ),
          CHILD,
        ),
      ).toEqual([]);
    });

    it('names a child of a grid with an `auto` column, and not of one without', () => {
      expect(
        causes(
          inContainer('{ type: grid, columns: [auto, 1fr] }', '{ type: text, text: x }'),
          CHILD,
        ),
      ).toEqual(['width']);
      expect(
        causes(
          inContainer('{ type: grid, columns: [1fr, 1fr] }', '{ type: text, text: x }'),
          CHILD,
        ),
      ).toEqual([]);
      expect(
        causes(inContainer('{ type: grid, columns: 2 }', '{ type: text, text: x }'), CHILD),
      ).toEqual([]);
    });
  });

  it('lists several causes in a fixed order', () => {
    const editor = editorOf(
      '{ type: container, box: { direction: row }, items: [{ type: text, text: x, style: { textOverflow: ellipsis, hangingPunctuation: allow_end } }] }',
    );
    expect(causes(editor, `${PATH}.items[0]`)).toEqual(['ellipsis', 'width', 'hanging']);
  });
});
