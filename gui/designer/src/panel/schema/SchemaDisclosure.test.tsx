// 「その他の設定」 over a live host, and the section over a DRAFT host. The
// disclosure: closed by default, the closed title counts the listed keys the
// target sets (and only when there are some), opening and closing authors
// nothing, and a surface with nothing to list draws nothing. The draft host:
// edits stay in the draft until save, which writes the changed keys as one
// undo step and leaves every other byte alone.

import { surfaceFields } from '@shojiku/designer-core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DraftHost, LiveHost } from '../../testkit/schemaHost';
import { COMPOSITES } from './composites';
import { SchemaDisclosure } from './SchemaDisclosure';

const STYLE = surfaceFields({ kind: 'style' }, COMPOSITES);

function fields(...keys: string[]) {
  return STYLE.filter((field) => keys.includes(field.key));
}

function source(...body: string[]): string {
  return [
    'styles:',
    '  s:',
    '    # a comment the section must keep',
    '    fontSize: 9',
    ...body.map((l) => `    ${l}`),
    'sections:',
    '  body:',
    '    type: flow',
    '    items: []',
    '',
  ].join('\n');
}

function doc(): string {
  return screen.getByTestId('doc').textContent ?? '';
}

describe('the disclosure', () => {
  const LISTED = fields('lineBreak', 'opacity', 'letterSpacing');

  it('starts closed and titles itself without a count when nothing is set', () => {
    render(<LiveHost source={source()} fields={LISTED} section={SchemaDisclosure} />);
    const toggle = screen.getByRole('button', { name: 'More settings' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Line-break rules')).toBeNull();
  });

  it('counts the listed keys the target sets while closed, and drops the count when open', () => {
    const src = source('lineBreak: strict', 'opacity: 0.5', 'textAlign: center');
    render(<LiveHost source={src} fields={LISTED} section={SchemaDisclosure} />);
    const toggle = screen.getByRole('button', { name: 'More settings (2 set)' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('More settings');
    expect(screen.getByLabelText('Line-break rules')).toBeTruthy();
    expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')).not.toBeNull();
    fireEvent.click(toggle);
    expect(screen.queryByLabelText('Line-break rules')).toBeNull();
    // Opening and closing is view state: the template is byte-identical.
    expect(doc()).toBe(src);
  });

  it('draws nothing when the surface lists no field', () => {
    render(<LiveHost source={source()} fields={[]} section={SchemaDisclosure} />);
    expect(screen.queryByRole('button', { name: /More settings/ })).toBeNull();
  });
});

describe('the draft host', () => {
  it('writes nothing until save, then the changed keys as one undo step', () => {
    const src = source('lineBreak: normal', 'opacity: 0.5');
    render(<DraftHost source={src} fields={fields('lineBreak', 'opacity', 'letterSpacing')} />);
    fireEvent.change(screen.getByLabelText('Line-break rules'), { target: { value: 'loose' } });
    fireEvent.blur(screen.getByLabelText('Opacity'), { target: { value: '' } });
    fireEvent.blur(screen.getByLabelText('Letter spacing'), { target: { value: '1' } });
    // The draft shows the edits; the document has none of them.
    expect((screen.getByLabelText('Line-break rules') as HTMLSelectElement).value).toBe('loose');
    expect(doc()).toBe(src);
    fireEvent.click(screen.getByText('save'));
    expect(doc()).toBe(source('lineBreak: loose', 'letterSpacing: 1'));
    fireEvent.click(screen.getByText('undo'));
    expect(doc()).toBe(src);
  });
});
