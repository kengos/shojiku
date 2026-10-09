// DOM → fragments. Three groups of case, and each one exists because a real
// browser was measured doing the thing it guards:
//
//   - the browser substitutes U+00A0 for a space it would otherwise collapse,
//     so a non-breaking space nobody typed can reach the wire;
//   - a cross-run edit can leave one run NESTED in another, so an outer run's
//     marks are lost by any walk that assumes flatness;
//   - a browser re-serializes an inline colour as `rgb(r, g, b)`, so reading it
//     back verbatim rewrites every coloured fragment it passes.

import { describe, expect, it } from 'vitest';
import { chipMetaMap } from './chipModel';
import { marksOfElement } from './runElementMarks';
import { buildRunNodes, COMBINE_ATTR, EMPTY_RUN_PLACEHOLDER, paintRun, RUN_ATTR } from './runNodes';
import { serializeRuns } from './runSerialize';
import { NO_MARKS, narrowRuns } from './spanRuns';

const META = chipMetaMap([{ key: 'order.total', label: 'Total', sample: '1,200' }]);

function seeded(spans: readonly unknown[]): HTMLElement {
  const host = document.createElement('div');
  for (const node of buildRunNodes(document, narrowRuns(spans), META)) {
    host.appendChild(node);
  }
  return host;
}

function run(index: number, text: string, className = 'sj-run'): HTMLElement {
  const el = document.createElement('span');
  el.setAttribute(RUN_ATTR, String(index));
  el.className = className;
  el.appendChild(document.createTextNode(text));
  return el;
}

describe('serializeRuns', () => {
  it('round-trips a seeded document unchanged', () => {
    const spans = [
      { text: 'Invoice ' },
      { data: { key: 'order.total' } },
      { text: ' yen', style: { fontWeight: 'bold' } },
    ];
    expect(
      serializeRuns(seeded(spans)).map((entry) => [entry.sourceIndex, entry.kind, entry.content]),
    ).toEqual([
      [0, 'text', 'Invoice '],
      [1, 'bound', 'order.total'],
      [2, 'text', ' yen'],
    ]);
  });

  it('restores a chip to its wire slice, never to its label', () => {
    const out = serializeRuns(seeded([{ text: 'Total: {order.total}!' }]));
    expect(out[0]?.content).toBe('Total: {order.total}!');
  });

  it('normalizes the U+00A0 a browser substitutes for a collapsing space', () => {
    const host = document.createElement('div');
    // Written as an ESCAPE: a literal U+00A0 in a source file is invisible in
    // review, so the case would read as asserting a space equals a space and
    // would pass against an implementation that normalized nothing.
    host.appendChild(run(0, '\u00A0See\u00A0'));
    expect(serializeRuns(host)[0]?.content).toBe(' See ');
  });

  it('strips the empty-fragment placeholder, so it can never become content', () => {
    const host = document.createElement('div');
    host.appendChild(run(0, EMPTY_RUN_PLACEHOLDER));
    expect(serializeRuns(host)).toEqual([
      { sourceIndex: 0, kind: 'text', content: '', marks: NO_MARKS, linked: false },
    ]);
  });

  it('composes a NESTED run with its ancestor rather than dropping either', () => {
    // The shape `extractContents` + `insertNode` leaves behind, measured in a
    // real browser. A walk that assumed flatness would report the inner run
    // un-bolded.
    const outer = run(0, '', 'sj-run sj-run--bold');
    outer.textContent = '';
    outer.appendChild(document.createTextNode('a'));
    outer.appendChild(run(1, 'b', 'sj-run sj-run--italic'));
    outer.appendChild(document.createTextNode('c'));
    const host = document.createElement('div');
    host.appendChild(outer);
    const out = serializeRuns(host);
    expect(out.map((entry) => [entry.content, entry.marks.bold, entry.marks.italic])).toEqual([
      ['a', true, false],
      ['b', true, true],
      ['c', true, false],
    ]);
  });

  it('JOINS two elements of one fragment — same source, same marks — back into one', () => {
    // A split the reader then un-marked, and the run clone a browser mints for
    // Enter, are both this shape: one fragment the DOM holds as two elements.
    const host = document.createElement('div');
    host.appendChild(run(0, 'a'));
    host.appendChild(run(0, 'b'));
    expect(serializeRuns(host).map((entry) => entry.content)).toEqual(['ab']);
  });

  it('keeps a duplicated source index on BOTH halves of a split whose marks differ', () => {
    const host = document.createElement('div');
    host.appendChild(run(3, 'left'));
    host.appendChild(run(3, 'right', 'sj-run--bold'));
    expect(serializeRuns(host).map((entry) => entry.sourceIndex)).toEqual([3, 3]);
  });

  it('keeps two AUTHORED neighbours apart even when their marks agree', () => {
    const host = document.createElement('div');
    host.appendChild(run(0, 'a'));
    host.appendChild(run(1, 'b'));
    expect(serializeRuns(host).map((entry) => entry.sourceIndex)).toEqual([0, 1]);
  });

  it('reads a run with no usable index as a NEW fragment', () => {
    const host = document.createElement('div');
    const el = run(0, 'x');
    el.setAttribute(RUN_ATTR, 'not-a-number');
    host.appendChild(el);
    expect(serializeRuns(host)[0]?.sourceIndex).toBeNull();
  });

  it('keeps ORPHAN text a browser left outside every run', () => {
    // Not seen in the probe, but a paste or a native undo can produce it, and
    // dropping it would silently delete what the reader typed.
    const host = document.createElement('div');
    host.appendChild(document.createTextNode('loose'));
    expect(serializeRuns(host)).toEqual([
      { sourceIndex: null, kind: 'text', content: 'loose', marks: NO_MARKS, linked: false },
    ]);
  });

  it('emits nothing for an EMPTY orphan text node', () => {
    // A fragment with no provenance AND no content is not a fragment — unlike
    // an empty run, which the document really does carry.
    const host = document.createElement('div');
    host.appendChild(document.createTextNode(''));
    expect(serializeRuns(host)).toEqual([]);
  });

  it('ignores a node that is neither element nor text', () => {
    const host = document.createElement('div');
    host.appendChild(document.createComment('a comment'));
    expect(serializeRuns(host)).toEqual([]);
  });

  it('emits nothing for an empty surface', () => {
    expect(serializeRuns(document.createElement('div'))).toEqual([]);
  });

  it('carries the link mark across', () => {
    const host = document.createElement('div');
    host.appendChild(run(0, 'here', 'sj-run sj-run--linked'));
    expect(serializeRuns(host)[0]?.linked).toBe(true);
  });
});

describe('marksOfElement', () => {
  it('normalizes an rgb() colour a browser wrote back into the authored hex', () => {
    const el = document.createElement('span');
    paintRun(el, { ...NO_MARKS, color: '#0a141e' }, false);
    // jsdom, like a browser, re-serializes the property — the point of the
    // normalization is that this comes back as what the document said.
    expect(marksOfElement(el).color).toBe('#0a141e');
  });

  it('reads no colour from an element that sets none', () => {
    expect(marksOfElement(document.createElement('span')).color).toBe('');
  });

  it('reads marks from the CLASSES, ignoring an unrelated one', () => {
    const el = document.createElement('span');
    el.className = 'sj-run sj-run--bold something-else';
    expect(marksOfElement(el)).toMatchObject({ bold: true, italic: false, decoration: 'none' });
  });

  it('answers for a non-HTML element without throwing', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    expect(marksOfElement(svg).color).toBe('');
  });
});

describe('serializeRuns — line breaks (the DOM a real browser mints for Enter)', () => {
  // Each fixture below is the markup Chrome produced in a measured session,
  // copied verbatim: Enter inside a run wraps a CLONE of the run element (same
  // `data-sj-run`, same mark classes) in a `<div>`.
  function minted(markup: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = markup;
    return host;
  }

  it('keeps the break Enter typed inside one fragment — as ONE fragment', () => {
    const host = minted(
      '<span data-sj-run="0" class="sj-run">第一行</span>' +
        '<div><span data-sj-run="0" class="sj-run">X\n第二行</span></div>',
    );
    expect(serializeRuns(host).map((entry) => [entry.sourceIndex, entry.content])).toEqual([
      [0, '第一行\nX\n第二行'],
    ]);
  });

  it('keeps the break at the END of a marked fragment, on that fragment', () => {
    const host = minted(
      '<span data-sj-run="0" class="sj-run">あいう</span>' +
        '<span data-sj-run="1" class="sj-run sj-run--bold">えお</span>' +
        '<div><span data-sj-run="1" class="sj-run sj-run--bold">Y\nZ</span></div>',
    );
    expect(serializeRuns(host).map((entry) => [entry.content, entry.marks.bold])).toEqual([
      ['あいう', false],
      ['えお\nY\nZ', true],
    ]);
  });

  it('reads a <br> as a break and drops the FINAL placeholder one', () => {
    const host = minted('<span data-sj-run="0" class="sj-run">a<br>b<br></span>');
    expect(serializeRuns(host)[0]?.content).toBe('a\nb');
  });

  it('carries a break after a BOUND fragment into the next text fragment', () => {
    // A bound value is atomic and cannot end with a break of its own.
    const host = seeded([{ data: { key: 'order.total' } }, { text: 'yen' }]);
    const line = document.createElement('div');
    line.appendChild(host.children[1] as Node);
    host.appendChild(line);
    expect(serializeRuns(host).map((entry) => entry.content)).toEqual(['order.total', '\nyen']);
  });

  it('keeps a break the reader ENDED on after a bound fragment, as a fragment of its own', () => {
    const host = seeded([{ data: { key: 'order.total' } }]);
    host.appendChild(document.createElement('br'));
    host.appendChild(document.createElement('br'));
    expect(serializeRuns(host)).toEqual([
      expect.objectContaining({ kind: 'bound', content: 'order.total' }),
      { sourceIndex: null, kind: 'text', content: '\n', marks: NO_MARKS, linked: false },
    ]);
  });

  it('puts a break typed OUTSIDE every run onto the open text', () => {
    const host = minted('loose<div>more</div>');
    expect(serializeRuns(host).map((entry) => entry.content)).toEqual(['loose\nmore']);
  });

  it('puts a break BEFORE a bound fragment on the text before it', () => {
    const host = seeded([{ text: 'Total' }, { data: { key: 'order.total' } }]);
    const line = document.createElement('div');
    line.appendChild(host.children[1] as Node);
    host.appendChild(line);
    expect(serializeRuns(host).map((entry) => entry.content)).toEqual(['Total\n', 'order.total']);
  });

  it('keeps two halves apart when only their LINK state differs', () => {
    const host = document.createElement('div');
    host.appendChild(run(0, 'a'));
    host.appendChild(run(0, 'b', 'sj-run sj-run--linked'));
    expect(serializeRuns(host).map((entry) => entry.linked)).toEqual([false, true]);
  });

  it('writes no break for a line container that OPENS the surface', () => {
    const host = minted('<div><span data-sj-run="0" class="sj-run">only</span></div>');
    expect(serializeRuns(host).map((entry) => entry.content)).toEqual(['only']);
  });
});

describe('serializeRuns — the tate-chu-yoko mark', () => {
  it('round-trips a seeded token, digits forms included', () => {
    const host = seeded([{ text: '12', style: { textCombineUpright: { digits: 3 } } }]);
    expect(serializeRuns(host)[0]?.marks.combine).toBe('digits3');
  });

  it('lets a NESTED run override its parent, and inherit it when it says nothing', () => {
    // Built bare: `run()` would seed an empty text node, which the walk reads
    // as a fragment of the outer run's own.
    const outer = document.createElement('span');
    outer.setAttribute(RUN_ATTR, '0');
    outer.setAttribute(COMBINE_ATTR, 'all');
    const inner = run(0, '12');
    outer.appendChild(inner);
    const host = document.createElement('div');
    host.appendChild(outer);
    expect(serializeRuns(host)[0]?.marks.combine).toBe('all');
    inner.setAttribute(COMBINE_ATTR, 'none');
    expect(serializeRuns(host)[0]?.marks.combine).toBe('none');
  });

  it('keeps two halves apart when only their tate-chu-yoko differs', () => {
    const host = document.createElement('div');
    host.appendChild(run(0, 'ab'));
    const tail = run(0, '12');
    tail.setAttribute(COMBINE_ATTR, 'all');
    host.appendChild(tail);
    expect(serializeRuns(host).map((entry) => entry.marks.combine)).toEqual(['', 'all']);
  });
});

describe('serializeRuns — verbatim (a plain item, read as the plain editor reads it)', () => {
  it('keeps an authored U+00A0 and U+200B exactly', () => {
    const host = document.createElement('div');
    host.appendChild(run(0, '10 kg​'));
    expect(serializeRuns(host, true)[0]?.content).toBe('10 kg​');
    // …which the default reading normalizes, as it does for a spans item.
    expect(serializeRuns(host)[0]?.content).toBe('10 kg');
  });
});
