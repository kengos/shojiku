import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { Breadcrumb } from './Breadcrumb';
import { buildTree } from './model';

const VIEW = buildTree(
  [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: table',
    '        data: { key: items }',
    '        columns:',
    '          - label: 品名',
    '            cell:',
    '              items:',
    '                - type: text',
    '                  data: { key: name }',
    '',
  ].join('\n'),
);

function draw(selection: string | null, onSelect = vi.fn()) {
  render(
    <I18nProvider locale="en">
      <Breadcrumb view={VIEW} selection={selection} onSelect={onSelect} />
    </I18nProvider>,
  );
  return onSelect;
}

const MULTILINE_VIEW = buildTree(
  [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: text',
    '        text: |-',
    '          東京都渋谷区1-2-3',
    '          シブヤビル 5F',
    '',
  ].join('\n'),
);

describe('Breadcrumb', () => {
  it('shortens a multi-line label the same way the tree row does', () => {
    // The crumb and the row read the SAME `nodeLabel`, so the flattening has
    // one home; this pins that the breadcrumb really is on the other end of it.
    render(
      <I18nProvider locale="en">
        <Breadcrumb view={MULTILINE_VIEW} selection="sections.body.items[0]" onSelect={vi.fn()} />
      </I18nProvider>,
    );
    const crumbs = screen.getAllByRole('button').map((el) => el.textContent);
    expect(crumbs).toEqual(['Body', '東京都渋谷区1-2-3 ⏎…']);
  });

  it('renders the ancestor chain of the selection', () => {
    draw('sections.body.items[0].columns[0].cell.items[0]');
    const crumbs = screen.getAllByRole('button').map((el) => el.textContent);
    expect(crumbs).toEqual(['Body', 'items', '品名', 'name']);
  });

  it('marks the deepest crumb as current and selects an ancestor on click', () => {
    const onSelect = draw('sections.body.items[0].columns[0]');
    const crumbs = screen.getAllByRole('button');
    expect(crumbs[2].getAttribute('aria-current')).toBe('true');
    expect(crumbs[0].getAttribute('aria-current')).toBeNull();
    fireEvent.click(crumbs[1]);
    expect(onSelect).toHaveBeenCalledWith('sections.body.items[0]');
  });

  it('keeps the bar but renders no crumbs without a selection', () => {
    draw(null);
    expect(screen.getByRole('navigation', { name: 'Selection path' })).toBeTruthy();
    expect(screen.queryAllByRole('button')).toEqual([]);
  });
});
