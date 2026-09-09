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
import { buildRunNodes, EMPTY_RUN_PLACEHOLDER, paintRun, RUN_ATTR } from './runNodes';
import { marksOfElement, serializeRuns } from './runSerialize';
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

  it('emits ONE fragment per contiguous stretch, splitting where the run changes', () => {
    const host = document.createElement('div');
    host.appendChild(run(0, 'a'));
    host.appendChild(run(0, 'b'));
    expect(serializeRuns(host)).toHaveLength(2);
  });

  it('keeps a duplicated source index on BOTH halves of a split', () => {
    const host = document.createElement('div');
    host.appendChild(run(3, 'left'));
    host.appendChild(run(3, 'right'));
    expect(serializeRuns(host).map((entry) => entry.sourceIndex)).toEqual([3, 3]);
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
