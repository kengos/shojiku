// The image's content tab driven through PropertyPanel over a REAL editor: the
// fixed ⇄ bound source switch (one batch, one undo, never both keys or
// neither), what a switch remembers for the way back, when the fixed option is
// offered at all, and the fit field on both arms.

import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { imageToFixedOps } from './imageSourceOps';
import { PropertyPanel } from './PropertyPanel';

const FIXED = 'sections.body.items[0]';
const BOUND = 'sections.body.items[1]';
const TEXT = 'sections.body.items[2]';
const BOTH = 'sections.body.items[3]';
const NEITHER = 'sections.body.items[4]';

const SOURCE = `sections:
  body:
    type: flow
    items:
      - { type: image, box: { w: 40, h: 40 }, src: assets/ロゴ.svg }
      - { type: image, box: { w: 40, h: 40 }, data: { key: shop.logo, scope: document } }
      - { type: text, text: hello }
      - { type: image, box: { w: 40, h: 40 }, src: kept.svg, data: { key: dropped } }
      - { type: image, box: { w: 40, h: 40 } }
`;

const PICKED = 'data:image/png;base64,QUJD';

interface HostProps {
  readonly start: string;
  /** `'host'` = a host that writes what it is given (a picked file stands in
   * for a pick); `'cancel'` = a host whose picker is cancelled (it is asked and
   * writes nothing); `'none'` = no callback at all. */
  readonly fix?: 'host' | 'cancel' | 'none';
  readonly picker?: boolean;
  readonly spy?: (path: string, remembered: string | null) => void;
}

function Harness({ start, fix = 'host', picker = true, spy = () => {} }: HostProps) {
  const editor = useEditor(SOURCE);
  const [path, setPath] = useState(start);
  const onFixImageSource = (target: string, remembered: string | null) => {
    spy(target, remembered);
    if (fix === 'host') {
      editor.applyAll(imageToFixedOps(target, remembered ?? PICKED));
    }
  };
  return (
    <I18nProvider locale="en">
      <PropertyPanel
        controller={editor}
        path={path}
        onFixImageSource={fix === 'none' ? undefined : onFixImageSource}
        onReplaceImage={picker ? () => {} : undefined}
      />
      <pre data-testid="doc">{editor.text}</pre>
      <span data-testid="can-undo">{String(editor.canUndo)}</span>
      <button type="button" onClick={editor.undo}>
        undo
      </button>
      <button type="button" onClick={editor.redo}>
        redo
      </button>
      <button
        type="button"
        onClick={() =>
          editor.apply({ op: 'moveItem', path: 'sections.body.items', from: 1, to: 0 })
        }
      >
        reorder
      </button>
      {[FIXED, BOUND, TEXT].map((p) => (
        <button key={p} type="button" onClick={() => setPath(p)}>
          {`select ${p}`}
        </button>
      ))}
    </I18nProvider>
  );
}

function doc(): string {
  return screen.getByTestId('doc').textContent ?? '';
}

/** The YAML line of the item at body index `i` (flow-mapping fixture, one line each). */
function itemLine(i: number): string {
  return (
    doc()
      .split('\n')
      .filter((line) => line.startsWith('      - '))[i] ?? ''
  );
}

function source(): HTMLSelectElement {
  return screen.getByRole('combobox', { name: 'Content source' }) as HTMLSelectElement;
}

function pick(value: 'fixed' | 'data' | 'text') {
  fireEvent.change(source(), { target: { value } });
}

function fixedOption(): HTMLOptionElement {
  return screen.getByRole('option', { name: 'Fixed image' }) as HTMLOptionElement;
}

describe('ImageContent — the source select', () => {
  it.each([
    [FIXED, 'fixed'],
    [BOUND, 'data'],
    [NEITHER, 'fixed'],
    [BOTH, 'data'],
  ])('reads %s as %s, under the Image heading', (path, mode) => {
    render(<Harness start={path} />);
    expect(source().value).toBe(mode);
    expect(fixedOption()).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Data binding' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Image' })).toBeTruthy();
  });

  it('gives a bound image the fit field, and its pick writes fit beside the binding', () => {
    render(<Harness start={BOUND} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fit mode' }));
    fireEvent.click(screen.getByRole('option', { name: 'Stretch (the proportions change)' }));
    expect(itemLine(1)).toContain('fit: stretch');
    expect(itemLine(1)).toContain('key: shop.logo');
  });

  it('offers no format and no blank placeholder on a bound image (the engine reads only the key)', () => {
    render(<Harness start={BOUND} />);
    expect(screen.getByLabelText('Data key')).toBeTruthy();
    expect(screen.queryByLabelText('Format')).toBeNull();
    expect(screen.queryByLabelText('Blank placeholder')).toBeNull();
  });
});

describe('ImageContent — switching', () => {
  it('fixed → data drops src and seeds an empty key in one batch; one undo restores it', () => {
    render(<Harness start={FIXED} />);
    pick('data');
    expect(itemLine(0)).not.toContain('src');
    expect(itemLine(0)).toContain('key: ""');
    expect(source().value).toBe('data');
    fireEvent.click(screen.getByRole('button', { name: 'undo' }));
    expect(itemLine(0)).toContain('src: assets/ロゴ.svg');
    expect(itemLine(0)).not.toContain('data');
  });

  it('a change to fixed with no host callback writes nothing', () => {
    render(<Harness start={BOUND} fix="none" />);
    const before = doc();
    pick('fixed');
    // The option is withheld too; a change event that reaches it anyway still
    // leaves the document — and so the select — as they were.
    expect(doc()).toBe(before);
    expect(source().value).toBe('data');
  });

  it('a cancelled pick leaves the image bound: the host is asked, nothing is written', () => {
    const spy = vi.fn();
    render(<Harness start={BOUND} fix="cancel" spy={spy} />);
    const before = doc();
    pick('fixed');
    expect(spy).toHaveBeenCalledWith(BOUND, null);
    expect(doc()).toBe(before);
    expect(source().value).toBe('data');
  });

  it('data → fixed with nothing remembered hands the host the path and no src', () => {
    const spy = vi.fn();
    render(<Harness start={BOUND} spy={spy} />);
    pick('fixed');
    expect(spy).toHaveBeenCalledWith(BOUND, null);
    expect(itemLine(1)).toContain(`src: "${PICKED}"`);
    expect(itemLine(1)).not.toContain('key:');
  });

  it('a document carrying both keys becomes fixed by dropping data alone — no host, no pick', () => {
    const spy = vi.fn();
    render(<Harness start={BOTH} spy={spy} picker={false} />);
    expect(fixedOption().disabled).toBe(false);
    pick('fixed');
    expect(spy).not.toHaveBeenCalled();
    expect(itemLine(3)).toContain('src: kept.svg');
    expect(itemLine(3)).not.toContain('data');
  });

  it('a neither-source image switched to data writes only the key (no removal of an absent src)', () => {
    render(<Harness start={NEITHER} />);
    pick('data');
    expect(itemLine(4)).toContain('data: { key: "" }');
  });

  it('re-picking the current mode authors nothing', () => {
    render(<Harness start={BOUND} />);
    const before = doc();
    pick('data');
    expect(doc()).toBe(before);
    expect(screen.getByTestId('can-undo').textContent).toBe('false');
  });
});

describe('ImageContent — what a switch remembers', () => {
  it('fixed → data → fixed hands the host the dropped src, a bundled path included', () => {
    const spy = vi.fn();
    render(<Harness start={FIXED} spy={spy} />);
    pick('data');
    pick('fixed');
    expect(spy).toHaveBeenCalledWith(FIXED, 'assets/ロゴ.svg');
    expect(itemLine(0)).toContain('src: assets/ロゴ.svg');
  });

  it('data → fixed → data restores the key and the scope in one batch', () => {
    render(<Harness start={BOUND} />);
    pick('fixed');
    pick('data');
    expect(itemLine(1)).toContain('key: shop.logo');
    expect(itemLine(1)).toContain('scope: document');
    expect(itemLine(1)).not.toContain('src');
    fireEvent.click(screen.getByRole('button', { name: 'undo' }));
    expect(itemLine(1)).toContain(`src: "${PICKED}"`);
  });

  it('keeps the memory across a selection of another item type and back', () => {
    const spy = vi.fn();
    render(<Harness start={FIXED} spy={spy} />);
    pick('data');
    fireEvent.click(screen.getByRole('button', { name: `select ${TEXT}` }));
    fireEvent.click(screen.getByRole('button', { name: `select ${FIXED}` }));
    pick('fixed');
    expect(spy).toHaveBeenCalledWith(FIXED, 'assets/ロゴ.svg');
  });

  it('forgets the dropped src once a reorder may have moved another image to its path', () => {
    const spy = vi.fn();
    render(<Harness start={FIXED} spy={spy} />);
    pick('data');
    // The bound image now sits at the path the dropped src was kept for.
    fireEvent.click(screen.getByRole('button', { name: 'reorder' }));
    expect(itemLine(0)).toContain('key: shop.logo');
    pick('fixed');
    expect(spy).toHaveBeenCalledWith(FIXED, null);
  });

  it('forgets it across a redo, which restores a snapshot rather than an edit', () => {
    render(<Harness start={FIXED} picker={false} />);
    pick('data');
    expect(fixedOption().disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'undo' }));
    fireEvent.click(screen.getByRole('button', { name: 'redo' }));
    expect(source().value).toBe('data');
    expect(fixedOption().disabled).toBe(true);
  });

  it('forgets the text pair’s dropped text the same way', () => {
    render(<Harness start={TEXT} />);
    pick('data');
    fireEvent.click(screen.getByRole('button', { name: 'reorder' }));
    pick('text');
    expect(itemLine(2)).toContain('text: ""');
  });

  it('never restores one image’s src into another', () => {
    const spy = vi.fn();
    render(<Harness start={FIXED} spy={spy} />);
    pick('data');
    fireEvent.click(screen.getByRole('button', { name: `select ${BOUND}` }));
    pick('fixed');
    expect(spy).toHaveBeenCalledWith(BOUND, null);
    expect(spy).not.toHaveBeenCalledWith(BOUND, 'assets/ロゴ.svg');
  });
});

describe('ImageContent — when the fixed option is offered', () => {
  it('withholds it from a bound image when the host cannot fix one', () => {
    render(<Harness start={BOUND} fix="none" />);
    expect(fixedOption().disabled).toBe(true);
  });

  it('withholds it with no picker and nothing remembered', () => {
    render(<Harness start={BOUND} picker={false} />);
    expect(fixedOption().disabled).toBe(true);
  });

  it('keeps it available where it is the mode shown, even with no way to make a src', () => {
    render(<Harness start={NEITHER} fix="none" picker={false} />);
    expect(source().value).toBe('fixed');
    expect(fixedOption().disabled).toBe(false);
  });

  it('offers it with a picker', () => {
    render(<Harness start={BOUND} />);
    expect(fixedOption().disabled).toBe(false);
  });

  it('offers it without a picker once a src is remembered for this image', () => {
    render(<Harness start={FIXED} picker={false} />);
    pick('data');
    expect(fixedOption().disabled).toBe(false);
  });
});
