// The hyperlink field, driven through PropertyPanel — which types get it, the
// capability gate, and the three behaviours that are invisible to a "does the
// input exist" assertion: a refused URL authors nothing AND says why, a trip
// into the field's own insert menu is NOT a commit, and an insertion commits
// its spliced value together with the declaration it staged, in one batch.

import { parseTemplate, readTemplate } from '@shojiku/designer-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type EditorController, useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { readBindings } from '../palette/bindings';
import { PropertyPanel } from './PropertyPanel';

const P = 'sections.body.items[0]';

afterEach(cleanup);

function makeController(node: unknown): EditorController {
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: (path: string) => (path === P ? node : undefined),
    undo: vi.fn(),
    redo: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setMaxBytes: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceDocument: vi.fn(),
  };
}

// `PropertyPanel` derives its palette from the DEFINITIONS yaml, not from a
// groups array — the field picker's rows come out of the schema walk.
const DEFS = [
  'version: "0.2.0"',
  'type: object',
  'properties:',
  '  order:',
  '    type: object',
  '    properties:',
  '      code:',
  '        type: string',
  '        title: Order code',
  '        example: A-1',
].join('\n');

// A key outside the interpolation charset (`[A-Za-z0-9_.]`), so a pick cannot
// be written as a bare `{key}` and must MINT a `bindings:` declaration.
const DECL_DEFS = [
  'version: "0.2.0"',
  'type: object',
  'properties:',
  '  \u54c1\u540d:',
  '    type: string',
  '    title: Product name',
  '    example: mikan',
].join('\n');

function draw(
  node: unknown,
  options: { capabilities?: readonly string[]; definitions?: string } = {},
): EditorController {
  const controller = makeController(node);
  render(
    <I18nProvider locale="en">
      <PropertyPanel
        controller={controller}
        path={P}
        capabilities={options.capabilities}
        definitions={options.definitions}
        params="{}"
        gridStep={0}
      />
    </I18nProvider>,
  );
  return controller;
}

const url = () => screen.getByLabelText('Link') as HTMLInputElement;

describe('which selections get a link field', () => {
  it('offers it on the two types the wire gives a `link:`', () => {
    draw({ type: 'text', text: 'hi' });
    expect(url().value).toBe('');
    cleanup();
    draw({ type: 'image', src: 'a.png' });
    expect(url().value).toBe('');
  });

  it('does not offer it on a type whose struct has no `link` field', () => {
    // `qr_code` looks like a text item in the panel and is a different wire
    // struct: authoring `link:` on one is a `deny_unknown_fields` parse error.
    draw({ type: 'qr_code', text: 'hi' });
    expect(screen.queryByLabelText('Link')).toBeNull();
    cleanup();
    draw({ type: 'rect', box: { w: 10 } });
    expect(screen.queryByLabelText('Link')).toBeNull();
  });

  it('withholds it from an engine that would reject the key at parse', () => {
    draw({ type: 'text', text: 'hi' }, { capabilities: ['item.visible'] });
    expect(screen.queryByLabelText('Link')).toBeNull();
    cleanup();
    draw({ type: 'image', src: 'a.png' }, { capabilities: ['item.visible'] });
    expect(screen.queryByLabelText('Link')).toBeNull();
    cleanup();
    // ...and offers it once the engine says it has the key.
    draw({ type: 'text', text: 'hi' }, { capabilities: ['link.url'] });
    expect(url().value).toBe('');
  });

  it('shows the url the document already carries', () => {
    draw({ type: 'text', text: 'hi', link: { url: 'https://x.test/{order.code}' } });
    expect(url().value).toBe('https://x.test/{order.code}');
  });
});

describe('committing a url', () => {
  it('authors the url on a blur that leaves the field', () => {
    const controller = draw({ type: 'text', text: 'hi' });
    fireEvent.blur(url(), { target: { value: 'https://x.test' } });
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: P, keys: ['link', 'url'], value: 'https://x.test' },
    ]);
  });

  it('refuses a url the engine would drop, authors NOTHING, and says why', () => {
    const controller = draw({ type: 'text', text: 'hi' });
    fireEvent.blur(url(), { target: { value: 'javascript:alert(1)' } });
    expect(controller.applyAll).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('http://');
  });

  it('names the BYTE cap when the url is too long', () => {
    // The other arm of the refusal message. The number in it is the engine's
    // own `MAX_LINK_URL`, passed as an ICU arg rather than written into six
    // catalogs where nothing would keep it equal to the engine.
    const controller = draw({ type: 'text', text: 'hi' });
    fireEvent.blur(url(), { target: { value: `https://x.test/${'a'.repeat(3000)}` } });
    expect(controller.applyAll).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('2048');
  });

  it('withdraws the message as soon as the reader starts fixing it', () => {
    // Found in the live pass: after a refusal the red box described a value
    // that was no longer on screen, so a freshly typed valid URL sat under a
    // message saying it was wrong.
    draw({ type: 'text', text: 'hi' });
    fireEvent.blur(url(), { target: { value: 'nope' } });
    expect(screen.queryByRole('status')).not.toBeNull();
    fireEvent.input(url(), { target: { value: 'https://x.test' } });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('clears the message once an acceptable url is committed', () => {
    draw({ type: 'text', text: 'hi' });
    fireEvent.blur(url(), { target: { value: 'nope' } });
    expect(screen.queryByRole('status')).not.toBeNull();
    // Re-queried: the refusal reseeds the input, so the node captured above is
    // detached and a second event on it would reach nothing.
    fireEvent.blur(url(), { target: { value: 'https://x.test' } });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('accepts an INTERPOLATING url with no scheme of its own', () => {
    const controller = draw({ type: 'text', text: 'hi' });
    fireEvent.blur(url(), { target: { value: '{web.invoice_url}' } });
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: P, keys: ['link', 'url'], value: '{web.invoice_url}' },
    ]);
  });

  it('authors nothing on a bare tab-through', () => {
    const controller = draw({ type: 'text', text: 'hi', link: { url: 'https://x.test' } });
    fireEvent.blur(url(), { target: { value: 'https://x.test' } });
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('removes the key when the field is emptied', () => {
    const controller = draw({ type: 'text', text: 'hi', link: { url: 'https://x.test' } });
    fireEvent.blur(url(), { target: { value: '' } });
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'removeKey', path: P, keys: ['link'] },
    ]);
  });
});

describe('the insert-a-field menu', () => {
  // NOT 'Insert a data field': the content tab shows TWO of these menus for a
  // text item — one for the text, one for the link URL — so each names what
  // it inserts into. A by-name query with two matches is the tell.
  const insertTrigger = () =>
    screen.getByRole('button', { name: 'Insert a data field into the link' });

  it('is NOT a commit — moving focus into it leaves the document alone', () => {
    // The whole reason this field is not the shared `TextField`: committing
    // here would remount the input and destroy the caret the insertion needs.
    const controller = draw({ type: 'text', text: 'hi' }, { definitions: DEFS });
    const input = url();
    fireEvent.change(input, { target: { value: 'https://x.test/' } });
    fireEvent.blur(input, { relatedTarget: insertTrigger() });
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('commits when focus leaves the BUTTON, not only when it leaves the input', () => {
    // Found live, invisible to every other case here. Tab from the field lands
    // on the insert button — correctly not a commit — and after that the INPUT
    // never blurs again. A handler living on the input strands the typed value
    // for good: nothing committed, and no refusal message either. The handler
    // is on the wrapper for exactly this, and `focusout` bubbles to it from the
    // button as well.
    const controller = draw({ type: 'text', text: 'hi' }, { definitions: DEFS });
    const input = url();
    fireEvent.change(input, { target: { value: 'https://x.test/' } });
    fireEvent.blur(input, { relatedTarget: insertTrigger() });
    fireEvent.blur(insertTrigger(), { relatedTarget: document.body });
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: P, keys: ['link', 'url'], value: 'https://x.test/' },
    ]);
  });

  it('refuses from a BUTTON blur too, and says why', () => {
    const controller = draw({ type: 'text', text: 'hi' }, { definitions: DEFS });
    fireEvent.change(url(), { target: { value: 'example.com' } });
    fireEvent.blur(url(), { relatedTarget: insertTrigger() });
    fireEvent.blur(insertTrigger(), { relatedTarget: document.body });
    expect(controller.applyAll).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('http://');
  });

  it('commits when focus leaves to NOWHERE (a relatedTarget of null)', () => {
    const controller = draw({ type: 'text', text: 'hi' }, { definitions: DEFS });
    fireEvent.blur(url(), { target: { value: 'https://x.test' }, relatedTarget: null });
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
  });

  it('commits when focus leaves to an element OUTSIDE the field', () => {
    const controller = draw({ type: 'text', text: 'hi' }, { definitions: DEFS });
    const elsewhere = screen.getByRole('tab', { name: 'Style' });
    fireEvent.blur(url(), { target: { value: 'https://x.test' }, relatedTarget: elsewhere });
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
  });

  it('MINTS a declaration for a key the bare grammar cannot write, in the same batch', () => {
    // The other arm of the insertion: `{}` is outside the interpolation
    // charset, so the pick has to author a `bindings:` entry, and it must reach
    // the document only alongside the URL that references it.
    const controller = draw({ type: 'text', text: 'hi' }, { definitions: DECL_DEFS });
    const input = url();
    fireEvent.click(insertTrigger());
    fireEvent.click(screen.getByRole('menuitem', { name: /Product name/ }));
    expect(input.value).toBe('{f1}');
    fireEvent.blur(input);
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: P, keys: ['link', 'url'], value: '{f1}' },
      { op: 'putValue', path: P, keys: ['bindings', 'f1'], value: { key: '\u54c1\u540d' } },
    ]);
  });

  it('splices the picked field at the caret, and the next blur commits it', () => {
    const controller = draw({ type: 'text', text: 'hi' }, { definitions: DEFS });
    const input = url();
    fireEvent.change(input, { target: { value: 'https://x.test/' } });
    input.setSelectionRange(15, 15);
    fireEvent.blur(input, { relatedTarget: insertTrigger() });
    fireEvent.click(insertTrigger());
    fireEvent.click(screen.getByRole('menuitem', { name: /Order code/ }));
    expect(input.value).toBe('https://x.test/{order.code}');
    fireEvent.blur(input);
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: P, keys: ['link', 'url'], value: 'https://x.test/{order.code}' },
    ]);
  });
});

describe('the declaration namespace is the whole ITEM, not this surface', () => {
  const insertTrigger = () =>
    screen.getByRole('button', { name: 'Insert a data field into the link' });

  it('mints PAST a name the item TEXT already uses', () => {
    // The defect one declaration map per item makes possible, and the reason
    // this field builds its own other-names set instead of reusing the chip
    // editor's: the item's `text:` already resolves `{f1}` through the map, so
    // a link insertion that minted `f1` would silently redirect the TEXT.
    const controller = draw(
      { type: 'text', text: 'order {f1}', bindings: { f1: { key: 'order.code' } } },
      { definitions: DECL_DEFS },
    );
    fireEvent.click(insertTrigger());
    fireEvent.click(screen.getByRole('menuitem', { name: /Product name/ }));
    expect(url().value).toBe('{f2}');
    fireEvent.blur(url());
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: P, keys: ['link', 'url'], value: '{f2}' },
      { op: 'putValue', path: P, keys: ['bindings', 'f2'], value: { key: '\u54c1\u540d' } },
    ]);
  });

  it('REUSES one declaration when the same field is picked twice', () => {
    const controller = draw({ type: 'text', text: 'hi' }, { definitions: DECL_DEFS });
    fireEvent.click(insertTrigger());
    fireEvent.click(screen.getByRole('menuitem', { name: /Product name/ }));
    fireEvent.click(insertTrigger());
    fireEvent.click(screen.getByRole('menuitem', { name: /Product name/ }));
    expect(url().value).toBe('{f1}{f1}');
    fireEvent.blur(url());
    // ONE `putValue`, not two: picking the same field twice is one declaration.
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: P, keys: ['link', 'url'], value: '{f1}{f1}' },
      { op: 'putValue', path: P, keys: ['bindings', 'f1'], value: { key: '\u54c1\u540d' } },
    ]);
  });
});

describe('the produced file (real editor)', () => {
  function Harness({ source }: { readonly source: string }) {
    const editor = useEditor(source);
    return (
      <I18nProvider locale="en">
        <PropertyPanel controller={editor} path={P} params="{}" />
        <pre data-testid="doc">{editor.text}</pre>
        <button type="button" data-testid="undo" onClick={editor.undo}>
          undo
        </button>
      </I18nProvider>
    );
  }

  const SOURCE = [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      # the shop name, printed at the top',
    '      - type: text',
    '        text: Shop',
    '        style: { fontSize: 12 }',
    '',
  ].join('\n');

  const doc = () => screen.getByTestId('doc').textContent ?? '';

  it('touches only the link key — every sibling key and comment survives', () => {
    // The adoption gate: a template engineer reviews the produced diff, so a
    // panel edit may not reorder or re-serialize anything it did not touch.
    render(<Harness source={SOURCE} />);
    fireEvent.blur(url(), { target: { value: 'https://x.test' } });
    const after = doc();
    expect(after).toContain('# the shop name, printed at the top');
    expect(after).toContain('style: { fontSize: 12 }');
    expect(after).toContain('url: https://x.test');
    // `map.set` APPENDS, so the created key lands at the item's tail.
    expect(after.indexOf('link:')).toBeGreaterThan(after.indexOf('style:'));
  });

  it('is ONE undo step', () => {
    render(<Harness source={SOURCE} />);
    fireEvent.blur(url(), { target: { value: 'https://x.test' } });
    expect(doc()).toContain('url: https://x.test');
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).toBe(SOURCE);
  });

  it('round-trips a URL whose characters are YAML-significant', () => {
    // The panel writes a document-derived string straight into the tree, so
    // "the op layer quotes it" is a claim rather than a reason to skip: an
    // anchor sigil, a tag sigil, a comment marker and a quote all mean
    // something to the parser. What the file must satisfy is that reading it
    // back yields the SAME string — which is what re-selecting proves.
    const nasty = 'https://x.test/?a=*b&c=!!str&d=%23e"f\'g';
    render(<Harness source={SOURCE} />);
    fireEvent.blur(url(), { target: { value: nasty } });
    // Read back through a fresh parse of the produced text, not through the
    // component's own state.
    const reparsed = readTemplate(parseTemplate(doc())) as Record<string, unknown>;
    const sections = reparsed.sections as Record<string, Record<string, unknown[]>>;
    const item = sections.body.items[0] as Record<string, Record<string, string>>;
    expect(item.link.url).toBe(nasty);
  });

  it('leaves a data key the URL now uses VISIBLE to the field-usage walk', () => {
    // The seam. `palette/bindings` reads an item's `link.url` as a usage of the
    // key it interpolates, so a URL authored here must show up there — the
    // panel is now a PRODUCER for a walk that has only ever read.
    render(<Harness source={SOURCE} />);
    fireEvent.blur(url(), { target: { value: 'https://x.test/{order.code}' } });
    expect(readBindings(doc()).some((ref) => ref.key === 'order.code')).toBe(true);
  });
});

describe('the help popover', () => {
  it('renders in the reader own language, not the English fallback', () => {
    // A catalog value carrying a literal brace is read as an ICU placeholder,
    // finds no matching arg, and silently falls back to ENGLISH for every
    // non-en locale. This body is ABOUT putting a data field in a URL, which
    // makes it the single most likely string in the change to have carried one.
    render(
      <I18nProvider locale="ja">
        <PropertyPanel
          controller={makeController({ type: 'text', text: 'hi' })}
          path={P}
          params="{}"
        />
      </I18nProvider>,
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: '\u3053\u306e\u9805\u76ee\u306e\u30ea\u30f3\u30af\u5148',
      }),
    );
    expect(
      screen.getByText(
        /\u30d7\u30ec\u30d3\u30e5\u30fc\u306e\u898b\u305f\u76ee\u306f\u5909\u308f\u308a\u307e\u305b\u3093/,
      ),
    ).toBeTruthy();
  });
});
