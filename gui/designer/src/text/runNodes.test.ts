// Seeding the flow surface. The load-bearing cases are the two SAFETY ones —
// a document-derived colour must not reach an inline style unless it is a plain
// hex, and nothing may be built through `innerHTML` — plus the placeholder that
// makes an empty fragment reachable by a caret at all.

import { describe, expect, it } from 'vitest';
import { chipMetaMap } from './chipModel';
import {
  BOUND_ATTR,
  buildRunNode,
  buildRunNodes,
  EMPTY_RUN_PLACEHOLDER,
  paintRun,
  RUN_ATTR,
  runClasses,
} from './runNodes';
import { NO_MARKS, narrowRuns, type RunMarks } from './spanRuns';

const META = chipMetaMap([{ key: 'order.total', label: 'Total', sample: '1,200' }]);

function seed(spans: readonly unknown[]): HTMLElement {
  const host = document.createElement('div');
  for (const node of buildRunNodes(document, narrowRuns(spans), META)) {
    host.appendChild(node);
  }
  return host;
}

describe('runClasses', () => {
  it('names one class per set mark, and none for an unset decoration', () => {
    expect(runClasses(NO_MARKS, false)).toEqual(['sj-run']);
    expect(
      runClasses({ bold: true, italic: true, decoration: 'underline', color: '' }, true),
    ).toEqual(['sj-run', 'sj-run--bold', 'sj-run--italic', 'sj-run--underline', 'sj-run--linked']);
    expect(runClasses({ ...NO_MARKS, decoration: 'line_through' }, false)).toContain(
      'sj-run--strike',
    );
  });
});

describe('paintRun', () => {
  const el = () => document.createElement('span');

  it('sets a plain hex colour as an inline style', () => {
    const node = el();
    paintRun(node, { ...NO_MARKS, color: '#c2402a' }, false);
    expect(node.style.getPropertyValue('color')).not.toBe('');
  });

  it('sets NO colour for anything that is not a plain 6-digit hex', () => {
    // The document is untrusted and this value reaches CSS. `isHexColor` is the
    // repo's one door for that, and these are the strings a hostile template
    // would use to get through a looser one.
    for (const hostile of [
      'red',
      '#fff',
      'url(https://evil.example/x)',
      'expression(alert(1))',
      '#c2402a;background:url(x)',
      'rgb(1,2,3)',
    ]) {
      const node = el();
      paintRun(node, { ...NO_MARKS, color: hostile }, false);
      expect(node.getAttribute('style')).toBeNull();
    }
  });

  it('CLEARS a colour a previous paint set', () => {
    const node = el();
    paintRun(node, { ...NO_MARKS, color: '#c2402a' }, false);
    paintRun(node, NO_MARKS, false);
    expect(node.style.getPropertyValue('color')).toBe('');
  });

  it('replaces the class list rather than accumulating marks', () => {
    const node = el();
    paintRun(node, { ...NO_MARKS, bold: true }, false);
    paintRun(node, { ...NO_MARKS, italic: true }, false);
    expect([...node.classList]).toEqual(['sj-run', 'sj-run--italic']);
  });
});

describe('buildRunNodes', () => {
  it('gives every run its wire index', () => {
    const host = seed([{ text: 'a' }, 'skipped', { text: 'c' }]);
    expect([...host.children].map((el) => el.getAttribute(RUN_ATTR))).toEqual(['0', '2']);
  });

  it('renders a fragment text through the chip layer, so {key} stays a chip', () => {
    const host = seed([{ text: 'Total: {order.total}' }]);
    const chip = host.querySelector('[data-sj-wire]');
    expect(chip?.getAttribute('data-sj-wire')).toBe('{order.total}');
    expect(chip?.textContent).toContain('Total');
  });

  it('seeds a bound fragment as an ATOMIC element holding its key', () => {
    const host = seed([{ data: { key: 'order.total' } }]);
    const bound = host.querySelector(`[${BOUND_ATTR}]`);
    expect(bound?.getAttribute(BOUND_ATTR)).toBe('order.total');
    expect(bound?.getAttribute('contenteditable')).toBe('false');
    // The picker's label when the key is known — an unlabelled box would say
    // nothing about WHICH field the fragment draws.
    expect(bound?.textContent).toBe('Total');
  });

  it('labels a bound fragment naming an unknown key with the key itself', () => {
    const host = seed([{ data: { key: 'not.a.field' } }]);
    expect(host.querySelector(`[${BOUND_ATTR}]`)?.textContent).toBe('not.a.field');
  });

  it('CLIPS a bound label, whichever untrusted source it came from', () => {
    // Both halves are attacker-controlled: the key is document text, the label
    // is definitions text. The panel's row clips at the same bound, so an
    // uncapped one here would also tell a reader two different things about one
    // fragment depending on where they met it.
    const long = 'k'.repeat(500);
    const host = seed([{ data: { key: long } }]);
    const shown = host.querySelector(`[${BOUND_ATTR}]`)?.textContent ?? '';
    expect(shown.length).toBeLessThan(80);
    // The ATTRIBUTE still carries the whole key — it is what the serializer
    // writes back, and clipping it would corrupt the document.
    expect(host.querySelector(`[${BOUND_ATTR}]`)?.getAttribute(BOUND_ATTR)).toBe(long);
  });

  it('does NOT clip a fragment TEXT — that is the content being edited', () => {
    const long = 'x'.repeat(500);
    const host = seed([{ text: long }]);
    expect(host.textContent).toBe(long);
  });

  it('seeds an EMPTY fragment with the placeholder, so a caret can rest in it', () => {
    // A span holding no text node has no position a caret can occupy, so the
    // browser skips it: the fragment becomes invisible AND uneditable.
    const host = seed([{}]);
    expect(host.children[0]?.textContent).toBe(EMPTY_RUN_PLACEHOLDER);
  });

  it('builds text through the DOM, never through markup', () => {
    const host = seed([{ text: '<img src=x onerror=alert(1)>' }]);
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('buildRunNode', () => {
  it('paints the run it builds', () => {
    const marks: RunMarks = { bold: true, italic: false, decoration: 'underline', color: '' };
    const node = buildRunNode(
      document,
      { index: 0, kind: 'text', content: 'x', marks, hasStyleNames: false, linked: true },
      META,
    );
    expect([...node.classList]).toEqual([
      'sj-run',
      'sj-run--bold',
      'sj-run--underline',
      'sj-run--linked',
    ]);
  });
});
