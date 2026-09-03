// A form mark's paint cluster over a REAL editor, so each control's write is
// proved against the document rather than against a spy: the wire is where the
// per-side map and the corner radius would show up, and neither may ever
// appear there.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { swatchLabel } from '../testkit/swatchLabel';
import { ShapeStyleEditor } from './ShapeStyleEditor';
import { readShapeStyle } from './shapeStyle';

const PATH = 'sections.body.items[0]';

const ELLIPSE = `sections:
  body:
    type: flow
    items:
      - type: ellipse
        box: { w: 60, h: 40 }
        style: { borderWidth: 2 }
`;

function Harness({ source = ELLIPSE }: { readonly source?: string }) {
  const editor = useEditor(source);
  return (
    <I18nProvider locale="en">
      <ShapeStyleEditor view={readShapeStyle(editor.read, PATH)} path={PATH} controller={editor} />
      <pre data-testid="doc">{editor.text}</pre>
      <button type="button" data-testid="undo" onClick={editor.undo}>
        undo
      </button>
    </I18nProvider>
  );
}

const doc = () => screen.getByTestId('doc').textContent ?? '';
const width = () => screen.getByLabelText('Line width') as HTMLInputElement;

describe('the outline width', () => {
  it('shows the authored width and commits a new one in one undo step', () => {
    render(<Harness />);
    expect(width().value).toBe('2');
    fireEvent.blur(width(), { target: { value: '0.5' } });
    expect(doc()).toMatch(/borderWidth:\s*0\.5/);
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).toMatch(/borderWidth:\s*2/);
  });

  it('authors nothing at all when the blur did not change the text', () => {
    // A tab-through must not remount the field or mint an undo step.
    render(<Harness />);
    const before = doc();
    fireEvent.blur(width(), { target: { value: '2' } });
    expect(doc()).toBe(before);
  });

  it('CLEARS the key on an empty field, returning the outline to its 1pt default', () => {
    // The placeholder says so: an empty field is a 1pt outline, not none.
    render(<Harness />);
    expect(width().placeholder).toBe('1');
    fireEvent.blur(width(), { target: { value: '' } });
    expect(doc()).not.toContain('borderWidth');
  });

  it('snaps back and authors nothing for a refused width', () => {
    for (const typed of ['abc', '-1', '2pt', '1001']) {
      const view = render(<Harness />);
      fireEvent.blur(width(), { target: { value: typed } });
      expect(doc()).toMatch(/borderWidth:\s*2/);
      // The reseed nonce is the only thing that can take the entry back off
      // screen: a refused commit never moves the value.
      expect(width().value).toBe('2');
      view.unmount();
    }
  });
});

describe('the two colours', () => {
  it('sets and clears the outline colour as a SCALAR', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Line color' }));
    fireEvent.click(screen.getByRole('menuitem', { name: swatchLabel('#b91c1c') }));
    expect(doc()).toMatch(/borderColor:\s*['"]#b91c1c['"]/);
    // A scalar, never a per-side map: the engine reduces a map to its top side
    // and warns `shape_border_sides_ignored`.
    expect(doc()).not.toContain('top:');
    fireEvent.click(screen.getByRole('button', { name: 'Line color' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear' }));
    expect(doc()).not.toContain('#b91c1c');
  });

  it('sets and clears the fill', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Background' }));
    fireEvent.click(screen.getByRole('menuitem', { name: swatchLabel('#b91c1c') }));
    expect(doc()).toMatch(/backgroundColor:\s*['"]#b91c1c['"]/);
    fireEvent.click(screen.getByRole('button', { name: 'Background' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear' }));
    expect(doc()).not.toContain('backgroundColor');
  });

  it('never authors a corner radius, whatever is clicked', () => {
    // `border_radius_ignored` ("a form mark") — the key would be a diagnostic
    // on every use, which is why this cluster is not the border editor.
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Line color' }));
    fireEvent.click(screen.getByRole('menuitem', { name: swatchLabel('#b91c1c') }));
    expect(doc()).not.toContain('borderRadius');
  });
});
