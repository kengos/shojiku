// Tests for itemView.ts — the panel's read-only projection of one item:
// content kind, bindings, style names, image source summary, and the
// registry-name reads.
import { describe, expect, it } from 'vitest';
import { imageSourceSummary, readItemView, registryNames } from './itemView';

describe('readItemView', () => {
  it('returns null for a non-item node', () => {
    expect(readItemView(undefined)).toBeNull();
    expect(readItemView('a string')).toBeNull();
    expect(readItemView(['a', 'list'])).toBeNull();
    expect(readItemView({ noType: true })).toBeNull();
  });

  it('extracts a static-text item with style and box', () => {
    const view = readItemView({
      type: 'text',
      text: 'hello',
      styleNames: ['heading', 'muted'],
      style: { fontSize: 24, color: '#333333' },
      box: { x: 0, y: 10, w: '50%' },
    });
    expect(view).not.toBeNull();
    expect(view?.contentMode).toBe('text');
    expect(view?.hasText).toBe(true);
    expect(view?.hasData).toBe(false);
    expect(view?.text).toBe('hello');
    expect(view?.styleNames).toEqual(['heading', 'muted']);
    expect(view?.style.fontSize).toBe('24');
    expect(view?.style.color).toBe('#333333');
    expect(view?.style.fontFamily).toBe('');
    expect(view?.box).toEqual({ x: '0', y: '10', w: '50%', h: '' });
  });

  it('extracts a data-bound item', () => {
    const view = readItemView({
      type: 'text',
      data: { key: 'total', format: 'currency', placeholder: '—' },
    });
    expect(view?.contentMode).toBe('data');
    expect(view?.hasData).toBe(true);
    expect(view?.dataKey).toBe('total');
    expect(view?.format).toBe('currency');
    expect(view?.placeholder).toBe('—');
  });

  it('reads an absent placeholder as an empty string', () => {
    const view = readItemView({ type: 'text', data: { key: 'total' } });
    expect(view?.placeholder).toBe('');
  });

  it('drops non-string entries from styleNames', () => {
    const view = readItemView({ type: 'text', styleNames: ['ok', 3, null] });
    expect(view?.styleNames).toEqual(['ok']);
  });
});

describe('imageSourceSummary', () => {
  it('derives the format and approximate KiB from a data URI', () => {
    expect(imageSourceSummary('data:image/png;base64,QUJD')).toEqual({ format: 'PNG', kib: 0 });
    expect(imageSourceSummary('data:image/jpeg;base64,QUJD').format).toBe('JPEG');
    expect(imageSourceSummary('data:image/svg+xml;base64,QUJD').format).toBe('SVG');
  });

  it('labels a non-data source (bundled path / inline markup) as a file', () => {
    expect(imageSourceSummary('assets/logo.svg')).toEqual({ format: 'file', kib: 0 });
  });
});

describe('registryNames', () => {
  it('lists the keys of a registry map', () => {
    expect(registryNames({ heading: {}, muted: {} })).toEqual(['heading', 'muted']);
  });

  it('is empty for an absent registry', () => {
    expect(registryNames(undefined)).toEqual([]);
  });
});

describe('readItemView — data scope', () => {
  it('reports an authored document scope, an unset one, and a hostile one', () => {
    const view = (data: unknown) => readItemView({ type: 'text', data });
    expect(view({ key: 'a', scope: 'document' })?.dataScope).toBe('document');
    // Unset is the engine's `element` default — reported as no scope at all,
    // so the badge never claims something the file does not say.
    expect(view({ key: 'a' })?.dataScope).toBe('');
    // A non-string value is not a scope; it degrades rather than rendering.
    expect(view({ key: 'a', scope: 5 })?.dataScope).toBe('');
    expect(view({ key: 'a', scope: { evil: true } })?.dataScope).toBe('');
    expect(view({ key: 'a', scope: ['document'] })?.dataScope).toBe('');
    // An authored NON-document scope stays verbatim (display honesty); only
    // `document` drives the badge, which the picker decides.
    expect(view({ key: 'a', scope: 'element' })?.dataScope).toBe('element');
  });
});
