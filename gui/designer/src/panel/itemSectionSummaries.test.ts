// Tests for itemSectionSummaries.ts — the closed decoration sections' one-liners.

import { describe, expect, it } from 'vitest';
import { readBorder } from './borderModel';
import {
  enumSummary,
  fillSectionSummary,
  fillSummary,
  itemTextSummary,
  opacitySummary,
} from './itemSectionSummaries';
import { readBand } from './tableStyleModel';

const i18n = {
  locale: 'en',
  t: (key: string, args?: Record<string, unknown>) =>
    args === undefined ? key : `${key}(${Object.values(args).join(',')})`,
};

describe('item section summaries', () => {
  it('names an enum value in the reader’s words, else not set', () => {
    expect(enumSummary(i18n, 'textOverflow', 'shrink')).toBe('style.value.textOverflow.shrink');
    expect(enumSummary(i18n, 'textOverflow', '')).toBe('panel.tableSection.band.unset');
  });

  it('joins the fill and a drawn border, else not set', () => {
    const bordered = readBorder(
      (p) => (p === 'x' ? { type: 'text', style: { borderWidth: 1 } } : undefined),
      'x',
    );
    const bare = readBorder((p) => (p === 'x' ? { type: 'text' } : undefined), 'x');
    expect(fillSummary(i18n, '#eeeeee', bordered)).toBe(
      ['panel.tableSection.band.fill(#eeeeee)', 'panel.itemSection.fill.border'].join(
        'panel.tableSection.sep',
      ),
    );
    expect(fillSummary(i18n, '', bare)).toBe('panel.tableSection.band.unset');
    expect(fillSummary(i18n, '#eeeeee', null)).toBe('panel.tableSection.band.fill(#eeeeee)');
  });

  it('shows the opacity as the field does', () => {
    expect(opacitySummary(i18n, '0.4')).toBe('40%');
    expect(opacitySummary(i18n, '')).toBe('panel.tableSection.band.unset');
  });
});

describe('item text and stroke summaries', () => {
  it('adds the item-only text keys to the band parts, vertical alignment included', () => {
    const band = readBand({ style: { verticalAlign: 'middle' } });
    expect(itemTextSummary(i18n, band, '2', 'underline line_through')).toBe(
      [
        'style.value.verticalAlign.middle',
        'panel.field.letterSpacing 2pt',
        'flow.underline',
        'flow.lineThrough',
      ].join('panel.tableSection.sep'),
    );
    expect(itemTextSummary(i18n, readBand({}), '', '')).toBe('panel.tableSection.band.unset');
  });

  it('summarises a line and a form mark by their own stroke', () => {
    const read = (p: string) =>
      ({
        l: { type: 'line', style: { width: 2, color: '#112233' } },
        m: { type: 'checkbox', style: { borderWidth: 1, backgroundColor: '#eeeeee' } },
        r: { type: 'rect' },
      })[p];
    expect(fillSectionSummary(i18n, read, 'l', 'line', '')).toBe(
      ['2pt', '#112233'].join('panel.tableSection.sep'),
    );
    expect(fillSectionSummary(i18n, read, 'm', 'checkbox', '')).toBe(
      ['1pt', 'panel.tableSection.band.fill(#eeeeee)'].join('panel.tableSection.sep'),
    );
    expect(fillSectionSummary(i18n, read, 'r', 'rect', '')).toBe('panel.tableSection.band.unset');
  });
});
