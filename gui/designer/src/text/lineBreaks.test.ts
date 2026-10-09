// The shared line-break rule, below both serializers. Each shape here is one
// a real browser was measured producing; `chipModel.test.ts` pins the plain
// serializer over the same shapes end to end and is deliberately left
// unmodified by the extraction, so it is the regression proof.

import { describe, expect, it } from 'vitest';
import { serializeEditor } from './chipModel';
import { breakBefore, isBreakElement, type LineState, lineChildren } from './lineBreaks';

function html(markup: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = markup;
  return host;
}

describe('lineChildren', () => {
  it('drops a <br> in FINAL position — the caret placeholder', () => {
    const host = html('a<br>');
    expect(lineChildren(host).map((node) => node.nodeName)).toEqual(['#text']);
  });

  it('keeps a <br> anywhere else', () => {
    const host = html('a<br>b');
    expect(lineChildren(host).map((node) => node.nodeName)).toEqual(['#text', 'BR', '#text']);
  });

  it('answers an empty list for an empty node', () => {
    expect(lineChildren(document.createElement('div'))).toEqual([]);
  });
});

describe('breakBefore', () => {
  const el = (tag: string) => document.createElement(tag);

  it('reads a <br> as a break, and marks a line begun', () => {
    const state: LineState = { started: false };
    expect(breakBefore(el('br'), state)).toBe('\n');
    expect(state.started).toBe(true);
    expect(isBreakElement(el('br'))).toBe(true);
  });

  it('ends the previous line at a line container once a line has begun', () => {
    for (const tag of ['div', 'p', 'li']) {
      expect(breakBefore(el(tag), { started: true })).toBe('\n');
    }
  });

  it('writes nothing for the container that OPENS the content, but begins a line', () => {
    const state: LineState = { started: false };
    expect(breakBefore(el('div'), state)).toBe('');
    expect(state.started).toBe(true);
    // …so an empty first container still counts as a line, and the next one
    // breaks.
    expect(breakBefore(el('div'), state)).toBe('\n');
  });

  it('contributes nothing for a decorative element, and leaves the state alone', () => {
    const state: LineState = { started: false };
    expect(breakBefore(el('span'), state)).toBe('');
    expect(state.started).toBe(false);
    expect(isBreakElement(el('span'))).toBe(false);
  });
});

describe('the rule over a NESTED container', () => {
  it('breaks for a line container inside a DECORATIVE element, through the shared flag', () => {
    // The shape the flag exists for (`<ul><li>` in the plain serializer's own
    // words): the inner container sees the line the outer text began. Both
    // serializers thread ONE state through their recursion; the plain one is
    // the cheapest place to watch it.
    const host = document.createElement('div');
    host.innerHTML = 'a<span><div>b</div></span>';
    expect(serializeEditor(host)).toBe('a\nb');
  });
});
