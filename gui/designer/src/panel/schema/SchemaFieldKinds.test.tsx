// The control kinds no named-style key has — a checkbox, a reference picker,
// an entry map, a shape the catalog could not read, a composite with no
// editor — over fixture fields, plus what needs a fixture initial: a number
// stepped from its initial while unset (and `-0` written as 0), and the list's
// `overflowText` with its catalog initial as the placeholder.

import { type CatalogField, surfaceFields } from '@shojiku/designer-core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LiveHost } from '../../testkit/schemaHost';
import type { FormatOption } from '../formatModel';
import type { PickerOption } from '../pickerModel';
import { COMPOSITES } from './composites';
import type { FieldEdit } from './fieldEdit';
import { widgetFor } from './widgets';

function field(key: string, spec: CatalogField['spec'], initial?: unknown): CatalogField {
  return { key, spec, capability: undefined, required: false, initial };
}

const BASE = 'sections:\n  body:\n    type: flow\n    items: []\n';

function source(...body: string[]): string {
  return `styles:\n  s:\n    fontSize: 9\n${body.map((l) => `    ${l}\n`).join('')}${BASE}`;
}

function doc(): string {
  return screen.getByTestId('doc').textContent ?? '';
}

const DATA_KEYS: readonly PickerOption[] = [
  { key: 'price', label: 'Price', type: 'number', sample: '120', enumValues: [] },
];
const FORMATS: readonly FormatOption[] = [
  { spelling: 'yen', labelKey: undefined, samples: [], origin: undefined, dropsTime: false },
];

describe('a boolean key', () => {
  it('authors the state its initial value does not stand for, and removes the other', () => {
    const src = source();
    render(<LiveHost source={src} fields={[field('lineHeight', { kind: 'boolean' })]} />);
    const box = screen.getByRole('checkbox', { name: 'Line height' });
    fireEvent.click(box);
    expect(doc()).toContain('lineHeight: true');
    fireEvent.click(box);
    expect(doc()).toBe(src);
  });

  it('shows an initial of true as ticked, and writes false only to untick it', () => {
    const src = source();
    render(<LiveHost source={src} fields={[field('color', { kind: 'boolean' }, true)]} />);
    const box = screen.getByRole('checkbox', { name: 'Color' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(doc()).toContain('color: false');
    fireEvent.click(box);
    expect(doc()).toBe(src);
  });

  it('shows a string, and a value equal to the initial, on the read-only row', () => {
    render(
      <LiveHost
        source={source("lineHeight: 'true'", 'color: true')}
        fields={[
          field('lineHeight', { kind: 'boolean' }),
          field('color', { kind: 'boolean' }, true),
        ]}
      />,
    );
    expect(screen.queryAllByRole('checkbox')).toEqual([]);
    expect(
      screen.getAllByText("This setting has a value that can't be shown or changed here."),
    ).toHaveLength(2);
  });
});

describe('a measure key', () => {
  it('writes zero for a typed negative zero, and steps an unset field from its initial', () => {
    const src = source();
    const number = field('lineHeight', { kind: 'number', bounds: {} }, 1.2);
    render(<LiveHost source={src} fields={[number]} context={{ unset: 'initial' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase Line height' }));
    expect(doc()).toContain('lineHeight: 2.2');
    fireEvent.blur(screen.getByLabelText('Line height'), { target: { value: '-0' } });
    expect(doc()).toContain('lineHeight: 0\n');
  });
});

describe('a reference key', () => {
  it('offers the data-key picker where the host gives data keys', () => {
    const edits: FieldEdit[] = [];
    render(
      <LiveHost
        source={source('text: price')}
        fields={[field('text', { kind: 'ref', ref: 'dataKey' })]}
        context={{ unset: 'blank', refs: { dataKey: DATA_KEYS } }}
        edits={edits}
      />,
    );
    expect(screen.getByRole('button', { name: 'Choose a data field' })).toBeTruthy();
    fireEvent.blur(screen.getByLabelText('Text'), { target: { value: 'total' } });
    expect(edits).toEqual([{ keys: ['text'], value: 'total' }]);
  });

  it('offers the format picker where the host gives formats', () => {
    render(
      <LiveHost
        source={source()}
        fields={[field('text', { kind: 'ref', ref: 'format' })]}
        context={{ unset: 'blank', refs: { format: FORMATS } }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Choose a format' })).toBeTruthy();
    fireEvent.blur(screen.getByLabelText('Text'), { target: { value: 'yen' } });
    expect(doc()).toContain('text: yen');
  });

  it('is typed as text where the host offers no pickers at all', () => {
    render(
      <LiveHost source={source()} fields={[field('text', { kind: 'ref', ref: 'dataKey' })]} />,
    );
    expect(screen.queryByRole('button', { name: 'Choose a data field' })).toBeNull();
    fireEvent.blur(screen.getByLabelText('Text'), { target: { value: 'price' } });
    expect(doc()).toContain('text: price');
  });

  it('is typed as text where the host offers no names of its kind', () => {
    render(
      <LiveHost
        source={source()}
        fields={[field('text', { kind: 'ref', ref: 'style' })]}
        context={{ unset: 'blank', refs: { dataKey: DATA_KEYS } }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Choose a data field' })).toBeNull();
    fireEvent.blur(screen.getByLabelText('Text'), { target: { value: 'heading' } });
    expect(doc()).toContain('text: heading');
  });
});

describe('a key the section has no control for', () => {
  const unread = [
    field('bindings', { kind: 'map', entry: [] }),
    field('opacity', { kind: 'opaque' }),
    field('textDecoration', { kind: 'composite', name: 'NoSuchType' }),
  ];

  it('draws nothing while unset', () => {
    const { container } = render(<LiveHost source={source()} fields={unread} />);
    expect(container.querySelectorAll('input, select')).toHaveLength(0);
    expect(screen.queryByText(/can't be shown or changed here/)).toBeNull();
  });

  it('shows a held value on the read-only row', () => {
    render(
      <LiveHost
        source={source('bindings: { a: { key: b } }', 'opacity: 1', 'textDecoration: underline')}
        fields={unread}
      />,
    );
    expect(
      screen.getAllByText("This setting has a value that can't be shown or changed here."),
    ).toHaveLength(3);
    expect(screen.getByText('Merge fields')).toBeTruthy();
  });

  it('has no widget for a map, an opaque node or an unregistered composite', () => {
    expect(unread.map((f) => widgetFor(f.spec))).toEqual([undefined, undefined, undefined]);
  });
});

describe('a text placeholder', () => {
  const [overflowText] = surfaceFields({ kind: 'item', type: 'list' }, COMPOSITES).filter(
    (f) => f.key === 'overflowText',
  );

  it('shows the catalog initial as its placeholder, and writes and removes the line', () => {
    const src = source();
    render(<LiveHost source={src} fields={[overflowText]} context={{ unset: 'initial' }} />);
    const input = screen.getByLabelText("Last line when rows don't fit") as HTMLInputElement;
    expect(input.placeholder).toBe('+{count}');
    fireEvent.blur(input, { target: { value: 'and {count} more' } });
    expect(doc()).toContain('overflowText: and {count} more');
    fireEvent.blur(screen.getByLabelText("Last line when rows don't fit"), {
      target: { value: '' },
    });
    expect(doc()).toBe(src);
  });

  it('shows no placeholder where the catalog states no initial', () => {
    render(
      <LiveHost
        source={source()}
        fields={[field('text', { kind: 'text' })]}
        context={{ unset: 'initial' }}
      />,
    );
    expect((screen.getByLabelText('Text') as HTMLInputElement).placeholder).toBe('');
  });

  it('shows no placeholder on a surface without initials', () => {
    render(<LiveHost source={source()} fields={[overflowText]} />);
    expect(
      (screen.getByLabelText("Last line when rows don't fit") as HTMLInputElement).placeholder,
    ).toBe('');
  });
});
