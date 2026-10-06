// The `line` endpoint editor, with the anchored arm. Three things are worth
// a component test rather than a model test: the arm is rendered from the
// WIRE (so an externally-authored anchor displays), the switch is ONE undo
// step (so the document is never in the mixed shape the engine rejects), and
// the control is gated on the engine capability (so an old engine is not
// handed a key it will refuse).

import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { LinePointsEditor } from './LinePointsEditor';
import { readLinePoints } from './linePoints';

const PATH = 'sections.body.items[1]';

const COORDS = `sections:
  body:
    type: absolute
    items:
      - { type: rect, id: total, box: { x: 0, y: 0, w: 20, h: 10 } }
      - { type: line, from: { x: 0, y: 2 }, to: { x: 40, y: 2 } }
`;

const ANCHORED = `sections:
  body:
    type: absolute
    items:
      - { type: rect, id: total, box: { x: 0, y: 0, w: 20, h: 10 } }
      - { type: line, from: { x: 0, y: 2 }, to: { item: total, edge: left } }
`;

/** Two candidates: the named rect and an UNNAMED text bound to `order.total`. */
const TWO_TARGETS = `sections:
  body:
    type: absolute
    items:
      - { type: rect, id: total, box: { x: 0, y: 0, w: 20, h: 10 } }
      - { type: line, from: { x: 0, y: 2 }, to: { item: total, edge: left } }
      - { type: text, data: { key: order.total }, box: { x: 0, y: 20, w: 20, h: 10 } }
`;

/** Nothing the line could name: a page_break places no box, and an anchored
 * ellipse is never a target. */
const ALONE = `sections:
  body:
    type: absolute
    items:
      - { type: page_break, id: fixed }
      - { type: line, from: { x: 0, y: 2 }, to: { x: 40, y: 2 } }
      - { type: ellipse, anchor: fixed, box: { w: 6, h: 4 } }
`;

/** The option key `AnchorTargetSelect` gives an offered item. */
const key = (index: number) => `p:sections.body.items[${index}]`;

function Harness({
  source,
  capabilities,
}: {
  readonly source: string;
  readonly capabilities?: readonly string[];
}) {
  const editor = useEditor(source);
  return (
    <I18nProvider locale="en">
      <LinePointsEditor
        view={readLinePoints(editor.read, PATH)}
        path={PATH}
        controller={editor}
        capabilities={capabilities}
      />
      <pre data-testid="doc">{editor.text}</pre>
      <button type="button" data-testid="undo" onClick={editor.undo}>
        undo
      </button>
    </I18nProvider>
  );
}

function doc(): string {
  return screen.getByTestId('doc').textContent ?? '';
}

describe('LinePointsEditor — the anchored arm', () => {
  it('renders the anchored fields when the WIRE carries `item`', () => {
    // Nothing in the UI put this document into the anchored arm.
    render(<Harness source={ANCHORED} />);
    const item = screen.getByLabelText('End at item') as HTMLSelectElement;
    expect(item.value).toBe(key(0));
    expect(item.selectedOptions[0]?.textContent).toBe('total (Rectangle)');
    expect((screen.getByLabelText('End edge') as HTMLSelectElement).value).toBe('left');
    // …and the start endpoint, still coordinates, keeps its own fields.
    expect(screen.getByLabelText('Start X')).toBeTruthy();
    expect(screen.queryByLabelText('End X')).toBeNull();
  });

  it('attaching PICKS the target, so `item` is never written empty', () => {
    // Writing `item: ''` first and asking after would make the line vanish
    // from the canvas before the user had chosen anything.
    render(<Harness source={COORDS} capabilities={['line.anchor']} />);
    const attach = screen.getAllByLabelText('Attach to an item')[1] as HTMLSelectElement;
    // There IS a candidate, so the control is live — not merely present.
    expect(attach.disabled).toBe(false);
    fireEvent.change(attach, { target: { value: key(0) } });
    expect(doc()).toContain('item: total');
    expect(doc()).not.toMatch(/to: \{ x:/);
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).toMatch(/to: \{ x: 40, y: 2 \}/);
  });

  it('keeps the attach control VISIBLE and disabled, saying why, when nothing can be named', () => {
    // Nothing here is a target: a page_break places no box, and an anchored
    // ellipse is never one. A control that appears and disappears reads as
    // a bug — the ellipse picker's rule.
    render(<Harness source={ALONE} capabilities={['line.anchor']} />);
    const attach = screen.getAllByLabelText('Attach to an item');
    expect(attach.length).toBe(2);
    for (const select of attach as HTMLSelectElement[]) {
      expect(select.disabled).toBe(true);
      expect(select.textContent).toBe('None available');
    }
  });

  it('keeps an authored id outside the list selectable rather than dropping it', () => {
    // No item carries `gone`, but the endpoint names it; the select must not
    // silently re-point the line to whatever option happens to be first.
    render(
      <Harness
        source={ANCHORED.replace('item: total', 'item: gone')}
        capabilities={['line.anchor']}
      />,
    );
    const item = screen.getByLabelText('End at item') as HTMLSelectElement;
    expect(item.value).toBe('v:gone');
    expect([...item.options].map((o) => o.value)).toEqual([key(0), 'v:gone']);
    expect(item.selectedOptions[0]?.textContent).toBe('gone (not found)');
    // Choosing it again changes nothing.
    fireEvent.change(item, { target: { value: 'v:gone' } });
    expect(doc()).toContain('item: gone');
  });

  it('keeps an authored edge outside the keyword set selectable rather than dropping it', () => {
    render(<Harness source={ANCHORED.replace('edge: left', 'edge: middle')} />);
    const edge = screen.getByLabelText('End edge') as HTMLSelectElement;
    expect(edge.value).toBe('middle');
    expect([...edge.options].map((o) => o.value)).toEqual([
      '',
      'top',
      'right',
      'bottom',
      'left',
      'center',
      'middle',
    ]);
  });

  it('stays ENABLED on an anchored end even with nothing else to offer', () => {
    // The rule is "disabled only when nothing is offered AND nothing is
    // chosen": an anchored end must still show — and keep — its value.
    const source = ANCHORED.replace(
      '{ type: rect, id: total, box: { x: 0, y: 0, w: 20, h: 10 } }',
      '{ type: page_break }',
    ).replace('item: total', 'item: gone');
    render(<Harness source={source} />);
    const item = screen.getByLabelText('End at item') as HTMLSelectElement;
    expect(item.disabled).toBe(false);
    expect([...item.options].map((o) => o.value)).toEqual(['v:gone']);
  });

  it('draws a long authored id CLIPPED while keeping the value exact', () => {
    // Longer than the 80-character display, within the 120 the name rule takes.
    const long = 'a'.repeat(110);
    render(<Harness source={ANCHORED.replace('item: total', `item: ${long}`)} />);
    const item = screen.getByLabelText('End at item') as HTMLSelectElement;
    expect(item.value).toBe(`v:${long}`);
    expect(item.selectedOptions[0]?.textContent).toBe(`${'a'.repeat(80)}… (not found)`);
  });

  it('numbers options that would read the same, in document order', () => {
    const source = `sections:
  body:
    type: absolute
    items:
      - { type: rect, box: { x: 0, y: 0, w: 20, h: 10 } }
      - { type: line, from: { x: 0, y: 2 }, to: { x: 40, y: 2 } }
      - { type: rect, box: { x: 0, y: 20, w: 20, h: 10 } }
      - { type: text, text: Only, box: { x: 0, y: 40, w: 20, h: 10 } }
`;
    render(<Harness source={source} />);
    const attach = screen.getAllByLabelText('Attach to an item')[0] as HTMLSelectElement;
    expect([...attach.options].map((o) => o.textContent)).toEqual([
      'Choose an item…',
      'Rectangle 1',
      'Rectangle 2',
      'Only (Text)',
    ]);
  });

  it('forgets the "named" note when another item is selected, and on coming back', () => {
    function Switcher({ source }: { readonly source: string }) {
      const editor = useEditor(source);
      const [path, setPath] = useState(PATH);
      return (
        <I18nProvider locale="en">
          <LinePointsEditor
            view={readLinePoints(editor.read, path)}
            path={path}
            controller={editor}
          />
          <button
            type="button"
            data-testid="other"
            onClick={() => setPath('sections.body.items[3]')}
          >
            other
          </button>
          <button type="button" data-testid="back" onClick={() => setPath(PATH)}>
            back
          </button>
        </I18nProvider>
      );
    }
    const source = `${TWO_TARGETS.replace('to: { item: total, edge: left }', 'to: { x: 40, y: 2 }')}      - { type: line, from: { x: 0, y: 9 }, to: { x: 9, y: 9 } }
`;
    render(<Switcher source={source} />);
    const attach = screen.getAllByLabelText('Attach to an item')[1] as HTMLSelectElement;
    fireEvent.change(attach, { target: { value: key(2) } });
    expect(screen.getByRole('status')).toBeTruthy();
    fireEvent.click(screen.getByTestId('other'));
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByTestId('back'));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('attaching to an UNNAMED item names it in the same undo step', () => {
    render(
      <Harness
        source={TWO_TARGETS.replace('to: { item: total, edge: left }', 'to: { x: 40, y: 2 }')}
      />,
    );
    const attach = screen.getAllByLabelText('Attach to an item')[1] as HTMLSelectElement;
    fireEvent.change(attach, { target: { value: key(2) } });
    expect(doc()).toContain('id: order_total');
    expect(doc()).toContain('item: order_total');
    expect(screen.getByRole('status').textContent).toBe(
      'Named that item “order_total” so this can follow it.',
    );
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).not.toContain('order_total');
    expect(doc()).toMatch(/to: \{ x: 40, y: 2 \}/);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('re-pointing to an UNNAMED item names it in the same undo step', () => {
    render(<Harness source={TWO_TARGETS} capabilities={['line.anchor']} />);
    fireEvent.change(screen.getByLabelText('End at item'), { target: { value: key(2) } });
    expect(doc()).toContain('id: order_total');
    expect(doc()).toContain('item: order_total');
    expect(doc()).toContain('edge: left');
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).not.toContain('order_total');
    expect(doc()).toContain('item: total');
  });

  it('labels each offered item as the layer tree does, and never the line itself', () => {
    render(<Harness source={TWO_TARGETS} />);
    const item = screen.getByLabelText('End at item') as HTMLSelectElement;
    expect([...item.options].map((o) => o.textContent)).toEqual([
      'total (Rectangle)',
      'order.total (Text)',
    ]);
  });

  it('shows an authored id in any script, and re-picks it', () => {
    const source = TWO_TARGETS.replace('id: total', 'id: 合計').replace(
      'item: total',
      'item: 合計',
    );
    render(<Harness source={source} />);
    const item = screen.getByLabelText('End at item') as HTMLSelectElement;
    expect(item.value).toBe(key(0));
    fireEvent.change(item, { target: { value: key(2) } });
    fireEvent.change(screen.getByLabelText('End at item'), { target: { value: key(0) } });
    expect(doc()).toContain('item: 合計');
  });

  it('switches anchored -> coordinates and reverts in ONE undo', () => {
    render(<Harness source={ANCHORED} capabilities={['line.anchor']} />);
    fireEvent.click(screen.getByText('Use coordinates'));
    expect(doc()).not.toContain('item: total');
    expect(doc()).not.toContain('edge: left');
    expect(doc()).toMatch(/to: \{ x: 0, y: 0 \}/);
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).toContain('item: total');
    expect(doc()).toContain('edge: left');
  });

  it('commits a re-picked target and edge', () => {
    render(
      <Harness
        source={TWO_TARGETS.replace('{ type: text, data', '{ type: text, id: other, data')}
        capabilities={['line.anchor']}
      />,
    );
    fireEvent.change(screen.getByLabelText('End at item'), { target: { value: key(2) } });
    expect(doc()).toContain('item: other');
    fireEvent.change(screen.getByLabelText('End edge'), { target: { value: 'top' } });
    expect(doc()).toContain('edge: top');
    // Clearing the edge removes the key — its absence IS `center`.
    fireEvent.change(screen.getByLabelText('End edge'), { target: { value: '' } });
    expect(doc()).not.toContain('edge:');
  });

  it('gates the control on the engine capability', () => {
    // OFF: the engine cannot read the key, so the control is absent —
    // asserted at the component, which is what pins the prop threading.
    render(<Harness source={COORDS} capabilities={[]} />);
    expect(screen.queryByLabelText('Attach to an item')).toBeNull();
    screen.getByLabelText('Start X');
  });

  it('is ungated when there is no engine to ask', () => {
    render(<Harness source={COORDS} />);
    expect(screen.getAllByLabelText('Attach to an item').length).toBe(2);
  });
});

// The refusal path here is the awkward one, and the reason the reseed is keyed
// on the BUILDER rather than on anything the controller reports: a refused
// point returns an EMPTY batch, and `applyAll([])` answers ok and bumps the
// revision. Both of the obvious signals therefore read a refusal as a success.

describe('LinePointsEditor refusal snap-back', () => {
  const REFUSED = ['', 'abc', '10pt%', 'x'.repeat(40)];

  for (const typed of REFUSED) {
    it(`snaps back and leaves the document untouched for ${JSON.stringify(typed.slice(0, 12))}`, () => {
      render(<Harness source={COORDS} />);
      const before = doc();
      const field = () => screen.getByLabelText('End X') as HTMLInputElement;
      fireEvent.blur(field(), { target: { value: typed } });
      expect(doc()).toBe(before);
      expect(field().value).toBe('40');
    });
  }

  it('reseeds even though the refusal path reports ok and bumps the revision', () => {
    // If the fix were keyed on `BatchResult.ok` or on the revision counter,
    // this case would look like a landed edit and the field would keep `abc`.
    render(<Harness source={COORDS} />);
    const before = doc();
    fireEvent.blur(screen.getByLabelText('End X'), { target: { value: 'abc' } });
    expect((screen.getByLabelText('End X') as HTMLInputElement).value).toBe('40');
    // The document is the proof that nothing was authored despite the ok.
    expect(doc()).toBe(before);
  });

  it('mints NO undo step for a refused point', () => {
    render(<Harness source={COORDS} />);
    const before = doc();
    fireEvent.blur(screen.getByLabelText('End X'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByTestId('undo'));
    // An undo after a refusal must not walk back a real earlier edit — there
    // was nothing on the stack to pop, so the document is unchanged.
    expect(doc()).toBe(before);
  });

  it('still commits an acceptable coordinate, so the snap-back is not blanket', () => {
    render(<Harness source={COORDS} />);
    fireEvent.blur(screen.getByLabelText('End X'), { target: { value: '55' } });
    expect(doc()).toMatch(/to: \{ x: 55/);
    expect((screen.getByLabelText('End X') as HTMLInputElement).value).toBe('55');
  });

  it('leaves the input in place on a bare blur that changes nothing', () => {
    // `linePointOps` returns an empty batch for UNCHANGED as well as for
    // invalid, so without the changed-guard a tab-through would remount the
    // field — dropping focus, and detaching any reference held to it.
    render(<Harness source={COORDS} />);
    const before = screen.getByLabelText('End X');
    fireEvent.blur(before, { target: { value: '40' } });
    expect(screen.getByLabelText('End X')).toBe(before);
  });

  it('reseeds ONE endpoint without disturbing the sibling being typed into', () => {
    render(<Harness source={COORDS} />);
    const startX = screen.getByLabelText('Start X') as HTMLInputElement;
    fireEvent.change(startX, { target: { value: '17' } });
    fireEvent.blur(screen.getByLabelText('End X'), { target: { value: 'abc' } });
    expect((screen.getByLabelText('End X') as HTMLInputElement).value).toBe('40');
    expect((screen.getByLabelText('Start X') as HTMLInputElement).value).toBe('17');
  });
});
