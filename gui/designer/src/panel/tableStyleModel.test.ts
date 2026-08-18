/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readBand, readTableStyle, TABLE_HEADER_FILL } from './tableStyleModel';

const EMPTY = { textAlign: '', backgroundColor: '', color: '', fontWeight: '' };

describe('readBand', () => {
  it('reads a band’s four properties out of its style map', () => {
    expect(
      readBand({
        style: {
          textAlign: 'center',
          backgroundColor: '#dbe7ff',
          color: '#222222',
          fontWeight: 'bold',
        },
      }),
    ).toEqual({
      textAlign: 'center',
      backgroundColor: '#dbe7ff',
      color: '#222222',
      fontWeight: 'bold',
    });
  });

  it('degrades a band that is not a map to unset, whatever the document carries', () => {
    for (const owner of ['header', 42, ['header'], null, undefined, true]) {
      expect(readBand(owner)).toEqual(EMPTY);
    }
  });

  it('degrades a style that is not a map to unset', () => {
    for (const style of ['bold', ['bold'], 7, null]) {
      expect(readBand({ style })).toEqual(EMPTY);
    }
  });

  it('drops a non-string property rather than stringifying it', () => {
    expect(readBand({ style: { textAlign: 3, backgroundColor: { r: 1 } } })).toEqual(EMPTY);
  });
});

describe('readTableStyle', () => {
  it('reads the header band, the body band and the zebra overlay independently', () => {
    const view = readTableStyle({
      type: 'table',
      header: { style: { fontWeight: 'bold' } },
      row: { style: { color: '#111111' }, alternateStyle: { backgroundColor: '#f6f8fa' } },
    });
    expect(view.header).toEqual({ ...EMPTY, fontWeight: 'bold' });
    expect(view.row).toEqual({ ...EMPTY, color: '#111111' });
    expect(view.zebra).toBe('#f6f8fa');
  });

  it('resolves an unset header fill to the engine floor, as a default-origin value', () => {
    const view = readTableStyle({ type: 'table' });
    expect(view.headerFill).toEqual({
      value: TABLE_HEADER_FILL,
      cascade: TABLE_HEADER_FILL,
      own: '',
      origin: 'engine',
      styleName: '',
    });
  });

  it('reports an authored header fill as the item’s OWN value, so no default line shows', () => {
    const view = readTableStyle({ header: { style: { backgroundColor: '#dbe7ff' } } });
    expect(view.headerFill.own).toBe('#dbe7ff');
    expect(view.headerFill.origin).toBe('own');
    expect(view.headerFill.value).toBe('#dbe7ff');
  });

  it('reads zebra as off when the overlay is absent and on when it carries a fill', () => {
    expect(readTableStyle({ type: 'table' }).zebra).toBe('');
    expect(readTableStyle({ row: { alternateStyle: {} } }).zebra).toBe('');
    expect(readTableStyle({ row: { alternateStyle: { backgroundColor: '#eee111' } } }).zebra).toBe(
      '#eee111',
    );
  });

  it('reads zebra as off when the overlay is a sequence rather than a map', () => {
    expect(readTableStyle({ row: { alternateStyle: ['#f6f8fa'] } }).zebra).toBe('');
    expect(readTableStyle({ row: 'striped' }).zebra).toBe('');
  });

  it('reports the table’s own fill, which the engine paints nowhere', () => {
    expect(readTableStyle({ style: { backgroundColor: '#00ff00' } }).ineffectiveFill).toBe(
      '#00ff00',
    );
    expect(readTableStyle({ style: { borderWidth: 0.5 } }).ineffectiveFill).toBe('');
    expect(readTableStyle({ type: 'table' }).ineffectiveFill).toBe('');
  });

  it('reports a hostile colour verbatim so it stays visible and clearable', () => {
    // Reported, NOT sanitized: the render site decides what may reach a style
    // (`isHexColor`), while the panel must still show the user what the file
    // says so they can remove it.
    const view = readTableStyle({
      header: { style: { backgroundColor: 'url(javascript:alert(1))' } },
      style: { backgroundColor: 'expression(1)' },
    });
    expect(view.header.backgroundColor).toBe('url(javascript:alert(1))');
    expect(view.ineffectiveFill).toBe('expression(1)');
  });

  it('degrades an unreadable node to an all-unset view rather than throwing', () => {
    for (const node of [undefined, null, 'table', 7, ['table']]) {
      const view = readTableStyle(node);
      expect(view.header).toEqual(EMPTY);
      expect(view.row).toEqual(EMPTY);
      expect(view.zebra).toBe('');
      expect(view.ineffectiveFill).toBe('');
      expect(view.headerFill.value).toBe(TABLE_HEADER_FILL);
    }
  });
});

describe('the mirrored engine constant', () => {
  it('matches the layout crate’s TABLE_HEADER_FILL', () => {
    // The panel shows this colour as the header's resolved default, so a change
    // on the engine side must fail HERE rather than quietly making the swatch
    // lie about what the page will carry.
    const source = readFileSync(
      resolve(process.cwd(), '../../engine/layout/src/engine/table.rs'),
      'utf8',
    );
    const declared = /const TABLE_HEADER_FILL: &str = "(#[0-9a-f]{6})";/.exec(source);
    expect(declared?.[1]).toBe(TABLE_HEADER_FILL);
  });
});
