// The `line` endpoint editor, with the anchored arm. Three things are worth
// a component test rather than a model test: the arm is rendered from the
// WIRE (so an externally-authored anchor displays), the switch is ONE undo
// step (so the document is never in the mixed shape the engine rejects), and
// the control is gated on the engine capability (so an old engine is not
// handed a key it will refuse).

import { fireEvent, render, screen } from '@testing-library/react';
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

function Harness({
  source,
  capabilities,
  targets = ['total'],
}: {
  readonly source: string;
  readonly capabilities?: readonly string[];
  readonly targets?: readonly string[];
}) {
  const editor = useEditor(source);
  return (
    <I18nProvider locale="en">
      <LinePointsEditor
        view={readLinePoints(editor.read, PATH)}
        path={PATH}
        controller={editor}
        capabilities={capabilities}
        targets={targets}
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
    expect((screen.getByLabelText('End at item') as HTMLSelectElement).value).toBe('total');
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
    fireEvent.change(attach, { target: { value: 'total' } });
    expect(doc()).toContain('item: total');
    expect(doc()).not.toMatch(/to: \{ x:/);
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).toMatch(/to: \{ x: 40, y: 2 \}/);
  });

  it('offers no attach control when the document has no other placed id', () => {
    // An empty target list means there is nothing the engine could resolve;
    // offering the switch would only produce `anchor_unknown_target`.
    render(<Harness source={COORDS} capabilities={['line.anchor']} targets={[]} />);
    expect(screen.queryByLabelText('Attach to an item')).toBeNull();
  });

  it('keeps an undisplayable authored id selectable rather than dropping it', () => {
    // The id is outside the panel's grammar, so the view blanks it — but the
    // endpoint is anchored, and the select must not silently re-point the
    // line to whatever option happens to be first.
    render(<Harness source={ANCHORED} capabilities={['line.anchor']} targets={['other']} />);
    const item = screen.getByLabelText('End at item') as HTMLSelectElement;
    expect(item.value).toBe('total');
    expect([...item.options].map((o) => o.value)).toContain('total');
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
      <Harness source={ANCHORED} capabilities={['line.anchor']} targets={['total', 'other']} />,
    );
    fireEvent.change(screen.getByLabelText('End at item'), { target: { value: 'other' } });
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
