// The one-line summaries a closed table section shows, in both tabs, rendered
// through the real English catalog — so a case pins the sentence a reader
// sees, not a key. Every section's unset/default arm, the arms its controls
// can author, and the hostile shapes its read model degrades.

import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { I18nProvider, useI18n } from '../i18n/context';
import { readBorder } from './borderModel';
import { readGroupsView } from './groupModel';
import {
  columnsSummary,
  controlHelp,
  emptySummary,
  groupsSummary,
  helpText,
  lengthText,
  pagesSummary,
  rowsSummary,
  type SummaryI18n,
} from './tableContentSummaries';
import {
  bandSummary,
  borderSummary,
  borderWidthRaw,
  conditionsSummary,
  styleNamesSummary,
  styleSummary,
} from './tableDecorationSummaries';
import { readTableSettings } from './tableSettingsModel';
import { bandStyleNames, gridWidthOf, readTableStyle } from './tableStyleModel';

function i18nFor(locale: string): SummaryI18n {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nProvider locale={locale}>{children}</I18nProvider>
  );
  return renderHook(() => useI18n(), { wrapper }).result.current;
}

const en = i18nFor('en');
const ja = i18nFor('ja');
const settings = (table: unknown) => readTableSettings(table);

describe('the shared helpers', () => {
  it('prints a bare number in points and anything else verbatim', () => {
    expect(lengthText('20')).toBe('20pt');
    expect(lengthText('20.5')).toBe('20.5pt');
    expect(lengthText('20pt')).toBe('20pt');
    expect(lengthText('5%')).toBe('5%');
    // A value the text read cannot show reads as a dash, not a blank.
    expect(lengthText('')).toBe('—');
  });

  it('joins a section help from its lines, dropping the ones passed as empty', () => {
    expect(helpText('General.', '')).toBe('General.');
    expect(helpText('', 'General.')).toBe('General.');
    expect(helpText('General.', 'Switch: does x.')).toBe('General.\nSwitch: does x.');
  });

  it('leads a control help line with the control’s own label, per locale', () => {
    expect(
      controlHelp(en, 'panel.tableSettings.mergeEmptyCells', 'panel.tableSection.empty.helpMerge'),
    ).toMatch(/^Join empty cells to the next one: In a body row/);
    expect(
      controlHelp(ja, 'panel.tableSettings.keepTogether', 'panel.tableSection.pages.helpKeep'),
    ).toMatch(/^表を途中で分けない：/);
  });
});

describe('content-tab summaries', () => {
  it('columns: the count, and the source only once one is bound', () => {
    expect(columnsSummary(en, 9, 'items')).toBe('Columns: 9 · Data: items');
    expect(columnsSummary(en, 0, '')).toBe('Columns: 0');
    expect(columnsSummary(ja, 9, 'items')).toBe('9列・データ：items');
  });

  it('rows: the engine defaults while nothing is authored', () => {
    expect(rowsSummary(en, settings({}), true)).toBe(
      'Row height auto (min 24pt) · Header Auto · Padding 4pt',
    );
  });

  it('rows: a fixed height the text read cannot show reads as a dash', () => {
    expect(rowsSummary(en, settings({ row: { height: { x: 1 } } }), true)).toBe(
      'Row height fixed — · Header Auto · Padding 4pt',
    );
  });

  it('rows: a fixed height, an authored header height and padding', () => {
    const view = settings({ row: { height: 30 }, header: { height: 22 }, cellPadding: 6 });
    expect(rowsSummary(en, view, true)).toBe('Row height fixed 30pt · Header 22pt · Padding 6pt');
  });

  it('rows: an authored minimum, and a relative height shown verbatim', () => {
    expect(rowsSummary(en, settings({ row: { minHeight: '5%' } }), true)).toBe(
      'Row height auto (min 5%) · Header Auto · Padding 4pt',
    );
  });

  it('rows: only the padding against an engine without row heights', () => {
    expect(rowsSummary(en, settings({ row: { height: 30 } }), false)).toBe('Padding 4pt');
  });

  it('pages: the switches that are on, by the engine defaults', () => {
    expect(pagesSummary(en, settings({}), 'flow', true)).toBe('Rows continue · Header repeats');
    expect(pagesSummary(en, settings({ keepTogether: true }), 'flow', true)).toBe(
      'Rows continue · Header repeats · Not split',
    );
  });

  it('pages: keep-together is not reported against an engine without it', () => {
    expect(pagesSummary(en, settings({ keepTogether: true }), 'flow', false)).toBe(
      'Rows continue · Header repeats',
    );
  });

  it('pages: every switch off says so rather than going blank', () => {
    const view = settings({ autoPageBreak: false, repeatHeader: false });
    expect(pagesSummary(en, view, 'flow', true)).toBe('All off');
  });

  it('pages: a bounded table does not cross pages, whatever it authors', () => {
    expect(pagesSummary(en, settings({ keepTogether: true }), 'bounded', true)).toBe(
      'Does not cross pages (drawn as one block)',
    );
  });

  it('empty: the zero-row choice and the merge switch', () => {
    expect(emptySummary(en, settings({}), true)).toBe(
      '0 rows: Hide the whole table · Empty cells: not joined',
    );
    const view = settings({ emptyBehavior: 'reserve', mergeEmptyCells: true });
    expect(emptySummary(en, view, true)).toBe(
      '0 rows: Show the header row only · Empty cells: joined',
    );
  });

  it('empty: no merge part against an engine without it', () => {
    expect(emptySummary(en, settings({ mergeEmptyCells: true }), false)).toBe(
      '0 rows: Hide the whole table',
    );
  });

  it('groups: none, and the labels as a list', () => {
    expect(groupsSummary(en, [])).toBe('None');
    const groups = readGroupsView({
      headerGroups: [{ label: 'Item', span: 2 }, { span: 1 }, { label: 'Price', span: 3 }],
    });
    expect(groupsSummary(en, groups ?? [])).toBe('Groups: 3 (Item, (unnamed), and Price)');
  });

  it('degrades a hostile table to the defaults rather than throwing', () => {
    const view = settings('not a table');
    expect(rowsSummary(en, view, true)).toBe(
      'Row height auto (min 24pt) · Header Auto · Padding 4pt',
    );
    expect(groupsSummary(en, readGroupsView({ headerGroups: 'x' }) ?? [])).toBe('None');
  });
});

describe('decoration-tab summaries', () => {
  const style = (table: unknown) => styleSummary(en, readTableStyle(table), gridWidthOf(table));

  it('style: the matching preset, or custom', () => {
    expect(style({})).toBe('Plain');
    expect(style({ row: { alternateStyle: { backgroundColor: '#f6f8fa' } } })).toBe('Banded');
    expect(style({ header: { style: { backgroundColor: '#123456' } } })).toBe('Custom');
  });

  it('style: says the header row is hidden', () => {
    expect(style({ header: { visuallyHidden: true } })).toBe('Plain · Header row hidden');
  });

  function border(table: Record<string, unknown>, styles: Record<string, unknown> = {}) {
    const reads: Record<string, unknown> = { t: table, styles };
    const read = (p: string) => reads[p];
    return borderSummary(en, readBorder(read, 't'), borderWidthRaw(read, 't'));
  }

  it('border: the engine default grid while nothing is authored', () => {
    expect(border({})).toBe('Grid 0.5pt (default)');
  });

  it('border: one width is the grid; 0 removes it', () => {
    expect(border({ style: { borderWidth: 1 } })).toBe('Grid 1pt');
    expect(border({ style: { borderWidth: 0 } })).toBe('No grid');
  });

  it('border: a line style and colour ride along when every side agrees', () => {
    expect(
      border({ style: { borderWidth: 2, borderStyle: 'dashed', borderColor: '#ff0000' } }),
    ).toBe('Grid 2pt · Dashed · #ff0000');
    // Solid is the default and says nothing.
    expect(border({ style: { borderWidth: 2, borderStyle: 'solid' } })).toBe('Grid 2pt');
  });

  it('border: a per-side map is an outer frame even when its sides are equal', () => {
    // The FORM decides on a table, not whether the widths differ.
    expect(border({ style: { borderWidth: { top: 2, right: 2, bottom: 2, left: 2 } } })).toBe(
      'Outer frame (per side)',
    );
    expect(border({ styleNames: ['framed'] }, { framed: { borderWidth: { top: 1 } } })).toBe(
      'Outer frame (per side)',
    );
  });

  it('border: a hostile shape claims nothing', () => {
    // The side-map parse reads both as no border; the summary must not say
    // "frame" or "no grid" over an editor showing nothing.
    expect(border({ style: { borderWidth: [] } })).toBe('');
    expect(border({ style: { borderWidth: '2pt' } })).toBe('');
  });

  it('border: sides that differ are an outer frame', () => {
    expect(border({ style: { borderWidth: { top: 2, bottom: 1 } } })).toBe(
      'Outer frame (per side)',
    );
  });

  it('border: per-side colours and styles are left out of a uniform width', () => {
    expect(
      border({
        style: {
          borderWidth: 1,
          borderStyle: { top: 'dashed', bottom: 'dotted' },
          borderColor: { top: '#111111' },
        },
      }),
    ).toBe('Grid 1pt');
  });

  it('border: a width from a named style counts as authored', () => {
    expect(border({ styleNames: ['ruled'] }, { ruled: { borderWidth: 1 } })).toBe('Grid 1pt');
  });

  it('band: nothing set, and each authored property', () => {
    expect(bandSummary(en, readTableStyle({}).header, [])).toBe('Not set');
    const header = readTableStyle({
      header: {
        style: {
          textAlign: 'center',
          backgroundColor: '#1f3a6b',
          color: '#ffffff',
          fontWeight: 'bold',
        },
      },
    }).header;
    expect(bandSummary(en, header, [])).toBe('Center · Fill #1f3a6b · Text #ffffff · Bold');
  });

  it('band: an explicit regular weight is reported, an unknown value verbatim', () => {
    const row = readTableStyle({
      row: { style: { fontWeight: 'normal', textAlign: 'justify' } },
    }).row;
    expect(bandSummary(en, row, [])).toBe('justify · Regular');
    const odd = readTableStyle({ row: { style: { fontWeight: '900' } } }).row;
    expect(bandSummary(en, odd, [])).toBe('900');
  });

  it('band: named styles on the band are listed, since they set its look too', () => {
    const table = { row: { styleNames: ['zebra', 7, 'total'] } };
    expect(bandSummary(en, readTableStyle(table).row, bandStyleNames(table, 'row'))).toBe(
      'Styles zebra and total',
    );
    expect(bandStyleNames({ header: { styleNames: 'x' } }, 'header')).toEqual([]);
  });

  it('conditions: none, or the rule count', () => {
    expect(conditionsSummary(en, 0)).toBe('None');
    expect(conditionsSummary(en, 2)).toBe('Rules: 2');
  });

  it('named styles: none, or the names as a list', () => {
    expect(styleNamesSummary(en, [])).toBe('None');
    expect(styleNamesSummary(en, ['a', 'b'])).toBe('a and b');
  });
});
