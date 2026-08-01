import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { BORDER_STYLE_VALUES } from './borderTypes';
import { LineStyleEditor } from './LineStyleEditor';
import { readLineStyle } from './lineModel';

const PATH = 'sections.body.items[0]';

const LINE = `sections:
  body:
    type: flow
    items:
      - type: line
        from: { x: 0, y: 2 }
        to: { x: 500, y: 2 }
        style: { width: 0.8, style: dashed }
`;

function Harness({
  source = LINE,
  capabilities,
}: {
  readonly source?: string;
  readonly capabilities?: readonly string[];
}) {
  const editor = useEditor(source);
  return (
    <I18nProvider locale="en">
      <LineStyleEditor
        view={readLineStyle(editor.read, PATH, BORDER_STYLE_VALUES)}
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

const doc = () => screen.getByTestId('doc').textContent ?? '';

describe('LineStyleEditor', () => {
  it('shows the line’s effective stroke so a キリトリ線 can be re-styled', () => {
    // The editing surface for what the insert menu creates: without it the
    // scaffold's dashed line could never become dotted.
    render(<Harness />);
    expect((screen.getByLabelText('Line width') as HTMLInputElement).value).toBe('0.8');
    expect((screen.getByLabelText('Line type') as HTMLSelectElement).value).toBe('dashed');
  });

  it('changes the pattern in one undo step', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Line type'), { target: { value: 'dotted' } });
    expect(doc()).toContain('style: dotted');
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).toContain('style: dashed');
  });

  it('removes the key when the pattern goes back to solid', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Line type'), { target: { value: 'solid' } });
    expect(doc()).not.toContain('style: dashed');
    expect(doc()).not.toContain('style: solid');
  });

  it('commits a typed width and leaves it alone on a bare blur', () => {
    render(<Harness />);
    const width = screen.getByLabelText('Line width');
    fireEvent.blur(width);
    expect(doc()).toContain('width: 0.8');
    fireEvent.change(width, { target: { value: '2' } });
    fireEvent.blur(width);
    expect(doc()).toContain('width: 2');
  });

  it('hides the pattern picker against an engine that cannot style a line', () => {
    render(<Harness capabilities={['style.border']} />);
    expect(screen.queryByLabelText('Line type')).toBeNull();
    // The width and colour controls are the engine's older wire and stay.
    expect(screen.getByLabelText('Line width')).toBeTruthy();
  });

  it('offers only solid and double without the patterned capability', () => {
    render(<Harness capabilities={['line.style']} />);
    const options = Array.from(screen.getByLabelText('Line type').querySelectorAll('option')).map(
      (o) => o.value,
    );
    expect(options).toEqual(['solid', 'double']);
  });

  it('authors a picked colour and clears it again', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Line color' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '#b91c1c' }));
    expect(doc()).toMatch(/color:\s*['"]#b91c1c['"]/);
    fireEvent.click(screen.getByRole('button', { name: 'Line color' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear' }));
    expect(doc()).not.toContain('#b91c1c');
  });
});
