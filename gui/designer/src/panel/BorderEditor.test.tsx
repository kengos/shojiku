import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { swatchLabel } from '../testkit/swatchLabel';
import { unitHintsFor } from '../testkit/unitHint';
import { BorderEditor } from './BorderEditor';
import { readBorder } from './borderModel';
import { readRadius } from './borderRadius';

const PATH = 'sections.body.items[0]';

function Harness({
  source,
  capabilities,
  isTable = false,
}: {
  readonly source: string;
  readonly capabilities?: readonly string[];
  readonly isTable?: boolean;
}) {
  const editor = useEditor(source);
  return (
    <I18nProvider locale="en">
      <BorderEditor
        view={readBorder(editor.read, PATH)}
        radius={readRadius(editor.read, PATH)}
        path={PATH}
        controller={editor}
        capabilities={capabilities}
        isTable={isTable}
      />
      <pre data-testid="doc">{editor.text}</pre>
      <button type="button" data-testid="undo" onClick={editor.undo}>
        undo
      </button>
    </I18nProvider>
  );
}

const RECT = `sections:
  body:
    type: flow
    items:
      - { type: rect, box: { w: 50, h: 20 } }
`;

function doc(): string {
  return screen.getByTestId('doc').textContent ?? '';
}

/** The pen-width StepperField's wrapper, for scoping a ▲/▼ query to it. */
function penWidthField(): HTMLElement {
  const input = screen.getByLabelText('Line width');
  const field = input.closest('span.mb-2');
  if (field === null) {
    throw new Error('pen width field not found');
  }
  return field as HTMLElement;
}

describe('BorderEditor — diagram', () => {
  it('renders four edge buttons, off edges dotted', () => {
    const { container } = render(<Harness source={RECT} />);
    expect(screen.getByRole('button', { name: 'Top border' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    const lines = container.querySelectorAll('svg line');
    expect(lines.length).toBe(4);
    // Every off edge is a dotted placeholder.
    for (const line of Array.from(lines)) {
      expect(line.getAttribute('stroke-dasharray')).toBe('2 3');
    }
  });

  it('reflects an on edge (solid) and a double edge (two strokes)', () => {
    const { container } = render(
      <Harness
        source={`sections:
  body:
    type: flow
    items:
      - type: rect
        box: { w: 50, h: 20 }
        style: { borderWidth: { top: 2, right: 1 }, borderStyle: { top: double } }
`}
      />,
    );
    expect(screen.getByRole('button', { name: 'Top border' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    // top = 2 lines (double), right = 1 line (solid), bottom+left = 2 dotted.
    expect(container.querySelectorAll('svg line').length).toBe(5);
  });

  it('toggles an edge and reverts via undo (one step)', () => {
    render(<Harness source={RECT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Left border' }));
    expect(doc()).toContain('left: 1');
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).not.toContain('left');
  });

  it('applies the pen width and line style to a preset', () => {
    render(<Harness source={RECT} />);
    // Bump the pen width to 2, switch to double. The editor hosts more than
    // one stepper (the radius field is the other), and every StepperField's
    // ▲ carries the same generic name — so scope the query to this field.
    fireEvent.click(within(penWidthField()).getByRole('button', { name: 'Increase' }));
    fireEvent.change(screen.getByLabelText('Line type'), { target: { value: 'double' } });
    fireEvent.click(screen.getByRole('button', { name: 'All sides' }));
    expect(doc()).toContain('borderWidth: 1.5');
    expect(doc()).toContain('borderStyle: double');
  });

  it('commits a typed pen width and applies it', () => {
    render(<Harness source={RECT} />);
    const width = screen.getByLabelText('Line width') as HTMLInputElement;
    width.value = '3';
    fireEvent.blur(width);
    fireEvent.click(screen.getByRole('button', { name: 'All sides' }));
    expect(doc()).toContain('borderWidth: 3');
  });

  it('ignores a non-numeric pen width (keeps the default)', () => {
    render(<Harness source={RECT} />);
    const width = screen.getByLabelText('Line width') as HTMLInputElement;
    width.value = 'abc';
    fireEvent.blur(width);
    fireEvent.click(screen.getByRole('button', { name: 'All sides' }));
    expect(doc()).toContain('borderWidth: 1');
    // …and the rejected text does not stay in the box over a pen that is
    // still 1pt. The pen is local state, so nothing else would have reseeded.
    expect((screen.getByLabelText('Line width') as HTMLInputElement).value).toBe('1');
  });

  it('takes the entry back when the pen clamp lands on the width ALREADY set', () => {
    // Set the pen to its floor, then clear the box: `Number('')` is 0, which
    // clamps back to the same 0.5. The commit lands, the value does not move,
    // and the box must not be left blank over a 0.5pt pen.
    render(<Harness source={RECT} />);
    const width = () => screen.getByLabelText('Line width') as HTMLInputElement;
    width().value = '0.1';
    fireEvent.blur(width());
    expect(width().value).toBe('0.5');
    width().value = '';
    fireEvent.blur(width());
    expect(width().value).toBe('0.5');
  });

  it('CLAMPS an out-of-range pen width rather than refusing it', () => {
    // A clamp is a commit — the value lands at the bound and the field shows
    // where it landed. Reading it as a refusal would hide the clamp entirely.
    render(<Harness source={RECT} />);
    const width = screen.getByLabelText('Line width') as HTMLInputElement;
    width.value = '99999';
    fireEvent.blur(width);
    fireEvent.click(screen.getByRole('button', { name: 'All sides' }));
    expect(doc()).toContain('borderWidth: 1000');
    expect((screen.getByLabelText('Line width') as HTMLInputElement).value).toBe('1000');
  });

  it('steps the pen from the committed width after a refused entry', () => {
    // Pins the inner-input key: keying the whole StepperField on the nonce
    // would unmount the ▲ between mousedown and mouseup.
    render(<Harness source={RECT} />);
    const width = screen.getByLabelText('Line width') as HTMLInputElement;
    width.value = 'abc';
    fireEvent.blur(width);
    fireEvent.click(within(penWidthField()).getByRole('button', { name: 'Increase' }));
    fireEvent.click(screen.getByRole('button', { name: 'All sides' }));
    expect(doc()).toContain('borderWidth: 1.5');
  });

  it('applies a picked pen color to a preset', () => {
    render(<Harness source={RECT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Line color' }));
    fireEvent.click(screen.getByRole('menuitem', { name: swatchLabel('#b45309') }));
    fireEvent.click(screen.getByRole('button', { name: 'All sides' }));
    expect(doc()).toContain('borderColor: "#b45309"');
  });

  it('clears every side with the None preset', () => {
    render(
      <Harness
        source={`sections:
  body:
    type: flow
    items:
      - { type: rect, box: { w: 50, h: 20 }, style: { borderWidth: 1 } }
`}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(doc()).not.toContain('borderWidth');
  });

  it('does nothing when a preset would not change the border', () => {
    render(
      <Harness
        source={`sections:
  body:
    type: flow
    items:
      - { type: rect, box: { w: 50, h: 20 }, style: { borderWidth: 1 } }
`}
      />,
    );
    const before = doc();
    fireEvent.click(screen.getByRole('button', { name: 'All sides' }));
    expect(doc()).toBe(before);
  });

  it('notes the style origin and the table outer-frame behavior', () => {
    render(
      <Harness
        isTable
        source={`styles:
  framed: { borderWidth: 1 }
sections:
  body:
    type: flow
    items:
      - { type: table, data: { key: rows }, columns: [{ label: A }], styleNames: [framed] }
`}
      />,
    );
    expect(screen.getByText('Border from style "framed"')).toBeTruthy();
    expect(screen.getByText('On a table this draws the outer frame only.')).toBeTruthy();
    // The diagram reflects the EFFECTIVE (style-sourced) state: every edge
    // reads pressed even though the item's own style has no border key.
    expect(screen.getByRole('button', { name: 'Top border' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Left border' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});

describe('BorderEditor — capability gating', () => {
  it('drops the per-side matrix without style.border.sides', () => {
    render(<Harness source={RECT} capabilities={['style.border']} />);
    expect(screen.queryByRole('button', { name: 'Top border' })).toBeNull();
    expect(screen.getByRole('button', { name: 'All sides' })).toBeTruthy();
  });

  it('drops the line-style select without style.borderStyle', () => {
    render(<Harness source={RECT} capabilities={['style.border', 'style.border.sides']} />);
    expect(screen.getByRole('button', { name: 'Top border' })).toBeTruthy();
    expect(screen.queryByLabelText('Line type')).toBeNull();
  });
});

describe('BorderEditor — patterned styles and corner radius', () => {
  it('offers dashed and dotted only when the engine understands them', () => {
    render(<Harness source={RECT} capabilities={['style.border', 'style.borderStyle']} />);
    const select = screen.getByLabelText('Line type');
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(options).toEqual(['solid', 'double']);
  });

  it('adds the patterned keywords with the dashed_dotted capability', () => {
    render(
      <Harness
        source={RECT}
        capabilities={['style.border', 'style.borderStyle', 'style.borderStyle.dashed_dotted']}
      />,
    );
    const select = screen.getByLabelText('Line type');
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(options).toEqual(['solid', 'double', 'dashed', 'dotted']);
  });

  it('applies a dashed pen to every side as one scalar key', () => {
    render(
      <Harness
        source={RECT}
        capabilities={[
          'style.border',
          'style.border.sides',
          'style.borderStyle',
          'style.borderStyle.dashed_dotted',
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText('Line type'), { target: { value: 'dashed' } });
    fireEvent.click(screen.getByRole('button', { name: 'All sides' }));
    expect(doc()).toContain('borderStyle: dashed');
    expect(doc()).not.toContain('top:');
  });

  it('hides the radius field without the borderRadius capability', () => {
    render(<Harness source={RECT} capabilities={['style.border']} />);
    expect(screen.queryByLabelText('Corner radius')).toBeNull();
  });

  it('shows the radius field with the capability and writes a bare pt number', () => {
    render(<Harness source={RECT} capabilities={['style.border', 'style.borderRadius']} />);
    const field = screen.getByLabelText('Corner radius');
    fireEvent.change(field, { target: { value: '6' } });
    fireEvent.blur(field);
    expect(doc()).toContain('borderRadius: 6');
  });

  it('preserves an authored unit instead of rewriting it as pt', () => {
    // The commit-on-blur identity rule: a percentage radius must survive
    // being displayed and re-committed, and a mere tab-through must write
    // nothing at all.
    const pill = `sections:
  body:
    type: flow
    items:
      - { type: rect, box: { w: 50, h: 20 }, style: { borderRadius: "50%" } }
`;
    render(<Harness source={pill} capabilities={['style.border', 'style.borderRadius']} />);
    const field = screen.getByLabelText('Corner radius');
    expect((field as HTMLInputElement).value).toBe('50%');
    fireEvent.blur(field);
    expect(doc()).toContain('borderRadius: "50%"');
    fireEvent.change(field, { target: { value: '40%' } });
    fireEvent.blur(field);
    // Quoted, because YAML would otherwise not read it as a string — but
    // still the AUTHORED unit, never re-expressed as a bare pt number.
    expect(doc()).toContain('borderRadius: "40%"');
    expect(doc()).not.toMatch(/borderRadius: 40\b(?!%)/);
  });

  it('reverts a radius in one undo step', () => {
    render(<Harness source={RECT} capabilities={['style.border', 'style.borderRadius']} />);
    const field = screen.getByLabelText('Corner radius');
    fireEvent.change(field, { target: { value: '8' } });
    fireEvent.blur(field);
    expect(doc()).toContain('borderRadius: 8');
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).not.toContain('borderRadius');
  });

  it('steps the radius from its placeholder and clamps at zero', () => {
    render(<Harness source={RECT} capabilities={['style.border', 'style.borderRadius']} />);
    // Re-query per click: each op reseeds the value-keyed field, so a
    // reference captured earlier points at a detached element.
    const step = (name: 'Increase' | 'Decrease') => {
      const field = screen.getByLabelText('Corner radius').closest('span.mb-2') as HTMLElement;
      fireEvent.click(within(field).getByRole('button', { name }));
    };
    // An empty field reads as its 0 placeholder, so the first ▲ authors 1.
    step('Increase');
    expect(doc()).toContain('borderRadius: 1');
    // Back to 0 — an authored zero, not a removal (the field still shows it).
    step('Decrease');
    expect(doc()).toContain('borderRadius: 0');
    // A further ▼ cannot go negative (the engine would warn and square it).
    step('Decrease');
    expect(doc()).not.toContain('borderRadius: -');
  });

  it('cannot step a value carrying a unit, so the unit is never invented away', () => {
    const pill = `sections:
  body:
    type: flow
    items:
      - { type: rect, box: { w: 50, h: 20 }, style: { borderRadius: "50%" } }
`;
    render(<Harness source={pill} capabilities={['style.border', 'style.borderRadius']} />);
    const field = screen.getByLabelText('Corner radius').closest('span.mb-2') as HTMLElement;
    expect(within(field).getByRole('button', { name: 'Increase' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(within(field).getByRole('button', { name: 'Decrease' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('clearing the radius removes the key', () => {
    const rounded = `sections:
  body:
    type: flow
    items:
      - { type: rect, box: { w: 50, h: 20 }, style: { borderRadius: 8 } }
`;
    render(<Harness source={rounded} capabilities={['style.border', 'style.borderRadius']} />);
    const field = screen.getByLabelText('Corner radius');
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.blur(field);
    expect(doc()).not.toContain('borderRadius');
  });

  it('previews a dashed edge with a real dash array', () => {
    const dashed = `sections:
  body:
    type: flow
    items:
      - type: rect
        box: { w: 50, h: 20 }
        style: { borderWidth: 1, borderStyle: dashed }
`;
    const { container } = render(
      <Harness
        source={dashed}
        capabilities={['style.border', 'style.border.sides', 'style.borderStyle']}
      />,
    );
    const dashArrays = Array.from(container.querySelectorAll('svg line')).map((l) =>
      l.getAttribute('stroke-dasharray'),
    );
    // Every side is on and dashed: 3× the preview stroke on and off.
    expect(dashArrays).toEqual(['3 3', '3 3', '3 3', '3 3']);
  });
});

describe('BorderEditor — the pen row and its `?`', () => {
  it('explains the pen-then-edge ORDER, and the edge-clears rule', () => {
    render(<Harness source={RECT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Setting a border' }));
    // The Excel model: the pen is set first, the edges are clicked after.
    expect(screen.getByText(/Set the pen first/)).toBeTruthy();
    // Pinned against `borderOps`: "an edge exactly matching the pen clears".
    expect(screen.getByText(/already matches the pen removes that edge/)).toBeTruthy();
  });

  it('carries the ACTION too — there is no always-visible hint any more', () => {
    // The hint line was folded into this `?` to give a cramped panel its line
    // back, so the popover is now the ONLY place that says an edge is clickable.
    render(<Harness source={RECT} />);
    expect(screen.queryByText(/Click an edge to add or remove it/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Setting a border' }));
    expect(screen.getByText(/click the edges you want it on/)).toBeTruthy();
  });

  it('gives all three pen labels the SAME label treatment', () => {
    // The row bottom-aligned three columns whose label markup differed, so the
    // labels landed on different baselines. One shared class is the fix, and
    // the thing a future edit would silently undo.
    const { container } = render(<Harness source={RECT} />);
    for (const name of ['Line width', 'Line color', 'Line type']) {
      const label = [...container.querySelectorAll('label, span')].find(
        (el) => el.textContent === name,
      );
      expect(label, name).toBeTruthy();
      expect(label?.className, name).toContain('mb-0.5');
      expect(label?.className, name).toContain('text-sm');
    }
  });
});

// The unit affordance (`stepper.unitHint`) is OPT-IN per field, because the
// WIRE decides: a key typed `Length` takes `25mm`, a key typed `number (pt)`
// does not. So each site that offers it is pinned at the site — an optional
// prop whose default is the disabled value can otherwise be dropped in a
// refactor with no type error, no lint and no red test.

describe('BorderEditor unit affordance', () => {
  it('invites another unit on the corner radius, whose key takes a length string', () => {
    render(<Harness source={RECT} />);
    expect(unitHintsFor('Corner radius').length).toBeGreaterThan(0);
  });

  // `borderWidth` is `number (pt)` in the wire, and `commitWidth` drops a
  // non-finite value — so `2mm` here is silently ignored. This field wearing
  // the same `pt` badge is exactly why the affordance is opt-in.
  it('does NOT invite one on the pen width, whose key is a plain number', () => {
    render(<Harness source={RECT} />);
    expect(unitHintsFor('Line width')).toHaveLength(0);
  });
});
