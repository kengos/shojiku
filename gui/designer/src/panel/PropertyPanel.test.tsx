import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { PropertyPanel } from './PropertyPanel';

function makeController(
  reads: Record<string, unknown>,
  overrides: Partial<EditorController> = {},
): EditorController {
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: (path: string) => reads[path],
    undo: vi.fn(),
    redo: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setMaxBytes: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceDocument: vi.fn(),
    ...overrides,
  };
}

function draw(node: ReactElement) {
  return render(<I18nProvider locale="en">{node}</I18nProvider>);
}

/** Per-item editing is split into 内容/装飾/配置 tabs — style/box controls
 * live behind their tab. Click it into view. */
function openTab(name: 'Content' | 'Style' | 'Layout') {
  fireEvent.click(screen.getByRole('tab', { name }));
}

const PATH = 'sections.body.items[0]';

describe('PropertyPanel', () => {
  it('shows the no-selection hint card pointing at the document view', () => {
    // The settings moved out of the panel into the fullscreen view; the
    // no-selection state is now a compact hint + a CTA that opens the view.
    const onOpenDocument = vi.fn();
    draw(
      <PropertyPanel controller={makeController({})} path={null} onOpenDocument={onOpenDocument} />,
    );
    expect(screen.getByText('Nothing selected.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open document settings' }));
    expect(onOpenDocument).toHaveBeenCalledTimes(1);
    // No page-setup surface in the panel any more.
    expect(screen.queryByLabelText('Size')).toBeNull();
  });

  it('omits the open-settings CTA when no handler is wired', () => {
    draw(<PropertyPanel controller={makeController({})} path={null} />);
    expect(screen.getByText('Nothing selected.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open document settings' })).toBeNull();
  });

  it('offers host-supplied font families as datalist suggestions', () => {
    const controller = makeController({
      [PATH]: { type: 'text', text: 'hi', style: {}, styleNames: [] },
      styles: {},
      formats: {},
    });
    draw(
      <PropertyPanel controller={controller} path={PATH} fontFamilies={['gf-lato', 'gf-kanit']} />,
    );
    openTab('Style');
    const input = screen.getByLabelText('Font family') as HTMLInputElement;
    expect(input.getAttribute('list')).toBe('sj-font-family-list');
    const options = Array.from(document.querySelectorAll('#sj-font-family-list option'), (o) =>
      o.getAttribute('value'),
    );
    expect(options).toEqual(['gf-lato', 'gf-kanit']);
    // Committing a picked value dispatches the normal style op (free text too).
    fireEvent.blur(input, { target: { value: 'gf-lato' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['style', 'fontFamily'],
      value: 'gf-lato',
    });
  });

  it('keeps the fontFamily field a plain input when no families are supplied', () => {
    const controller = makeController({
      [PATH]: { type: 'text', text: 'hi', style: {}, styleNames: [] },
      styles: {},
      formats: {},
    });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    openTab('Style');
    expect(
      (screen.getByLabelText('Font family') as HTMLInputElement).getAttribute('list'),
    ).toBeNull();
  });

  it('falls back to the no-selection card when the selected node no longer exists', () => {
    // An undo/removal can leave the selection pointing at a ghost path; the
    // panel must not show the unsupported-type note for it — it shows the
    // no-selection hint (the ghost reads as nothing selected).
    draw(<PropertyPanel controller={makeController({})} path={PATH} />);
    expect(screen.getByText('Nothing selected.')).toBeTruthy();
  });

  it('shows an unsupported note for a non-item node', () => {
    const controller = makeController({ [PATH]: { notAnItem: true } });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    expect(screen.getByText(/no editable fields/)).toBeDefined();
  });

  it('offers the create-field tail on a DOCUMENT-scope data.key picker', () => {
    const controller = makeController({ [PATH]: { type: 'text', data: { key: 'foo' } } });
    draw(<PropertyPanel controller={controller} path={PATH} onCreateField={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.getByRole('menuitem', { name: /Create data field/i })).toBeTruthy();
  });

  it('hides the create-field tail on a ROW-scope data.key picker (fresh key cannot bind it)', () => {
    const rowItem = `${PATH}.item.items[0]`;
    const controller = makeController({
      [PATH]: {
        type: 'repeat_flow',
        data: { key: 'rows' },
        item: { items: [{ type: 'text', data: { key: 'foo' } }] },
      },
      [rowItem]: { type: 'text', data: { key: 'foo' } },
    });
    draw(<PropertyPanel controller={controller} path={rowItem} onCreateField={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.queryByRole('menuitem', { name: /Create data field/i })).toBeNull();
  });

  it('renders the columns section for a selected table', () => {
    const controller = makeController({
      [PATH]: {
        type: 'table',
        data: { key: 'rows' },
        columns: [{ label: '品名', data: { key: 'name' } }],
      },
      styles: {},
      formats: {},
    });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    expect(screen.getByText('Columns')).toBeTruthy();
    expect((screen.getByLabelText('Column label') as HTMLInputElement).value).toBe('品名');
  });

  it('gives a repeat_flow its data-source section and a list its entry text too', () => {
    const controller = makeController({
      [PATH]: { type: 'repeat_flow', data: { key: 'rows' }, item: { items: [] } },
      'sections.body.items[1]': { type: 'list', data: { key: 'tags' }, text: '{name}' },
    });
    const { unmount } = draw(<PropertyPanel controller={controller} path={PATH} />);
    expect(screen.getByText('Data source')).toBeTruthy();
    expect((screen.getByLabelText('Data key') as HTMLInputElement).defaultValue).toBe('rows');
    expect(screen.queryByLabelText('Entry text')).toBeNull();
    unmount();
    draw(<PropertyPanel controller={controller} path="sections.body.items[1]" />);
    expect((screen.getByLabelText('Entry text') as HTMLInputElement).defaultValue).toBe('{name}');
  });

  it('opens the column form for a canvas column selection', () => {
    const columnPath = `${PATH}.columns[0]`;
    const controller = makeController({
      [PATH]: {
        type: 'table',
        data: { key: 'rows' },
        columns: [{ label: '品名', data: { key: 'name' }, width: 90 }],
      },
      [columnPath]: { label: '品名', data: { key: 'name' }, width: 90 },
    });
    draw(<PropertyPanel controller={controller} path={columnPath} />);
    expect(screen.getByText('Column')).toBeTruthy();
    expect((screen.getByLabelText('Column label') as HTMLInputElement).value).toBe('品名');
    expect((screen.getByLabelText('Column width') as HTMLInputElement).value).toBe('90');
  });

  it('keeps the unsupported note for a column path whose table has no such column', () => {
    const columnPath = `${PATH}.columns[4]`;
    const controller = makeController({
      [PATH]: { type: 'table', columns: [{ label: 'x' }] },
      [columnPath]: { stray: true },
    });
    draw(<PropertyPanel controller={controller} path={columnPath} />);
    expect(screen.getByText(/no editable fields/)).toBeDefined();
  });

  it('opens the group form for a canvas header-group selection', () => {
    const groupPath = `${PATH}.headerGroups[0]`;
    const controller = makeController({
      [PATH]: {
        type: 'table',
        data: { key: 'rows' },
        headerGroups: [{ label: 'Quantity', span: 2 }],
        columns: [{ label: 'Ordered' }, { label: 'Shipped' }],
      },
      [groupPath]: { label: 'Quantity', span: 2 },
    });
    draw(<PropertyPanel controller={controller} path={groupPath} />);
    // The GROUP's own form, not the leftmost column's — the defect this
    // addressing change exists to fix.
    expect(screen.getByText('Group settings')).toBeTruthy();
    expect(screen.queryByLabelText('Column label')).toBeNull();
    expect((screen.getByLabelText('Group label') as HTMLInputElement).value).toBe('Quantity');
    expect((screen.getByLabelText('Span (columns)') as HTMLInputElement).value).toBe('2');
  });

  it('keeps the unsupported note for a group path whose table has no such group', () => {
    const groupPath = `${PATH}.headerGroups[3]`;
    const controller = makeController({
      [PATH]: { type: 'table', headerGroups: [{ label: 'x', span: 1 }] },
      [groupPath]: { stray: true },
    });
    draw(<PropertyPanel controller={controller} path={groupPath} />);
    expect(screen.getByText(/no editable fields/)).toBeDefined();
  });

  it('keeps the unsupported note for a group path on a table with no groups at all', () => {
    const groupPath = `${PATH}.headerGroups[0]`;
    const controller = makeController({
      [PATH]: { type: 'table', columns: [{ label: 'x' }] },
      [groupPath]: { stray: true },
    });
    draw(<PropertyPanel controller={controller} path={groupPath} />);
    expect(screen.getByText(/no editable fields/)).toBeDefined();
  });

  it('shows a content-section help whose 「詳しく見る」 opens the glossary', () => {
    const onOpenGlossary = vi.fn();
    const controller = makeController({ [PATH]: { type: 'text', text: 'hi' } });
    draw(<PropertyPanel controller={controller} path={PATH} onOpenGlossary={onOpenGlossary} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fixed text vs. data' }));
    expect(screen.getByText(/Choose Text to type words that stay the same/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Learn more' }));
    expect(onOpenGlossary).toHaveBeenCalledOnce();
  });

  it('shows a decoration-section help on the 装飾 tab (no glossary link unwired)', () => {
    const controller = makeController({ [PATH]: { type: 'text', style: {} } });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    openTab('Style');
    fireEvent.click(screen.getByRole('button', { name: 'Where a value comes from' }));
    expect(screen.queryByRole('button', { name: 'Learn more' })).toBeNull();
  });

  it('renders content, style, styleNames and box for a static-text item', () => {
    const controller = makeController({
      [PATH]: { type: 'text', text: 'hi', style: { fontSize: 24 }, styleNames: ['heading'] },
      styles: { heading: {}, muted: {} },
      formats: {},
    });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    // 内容 tab (default).
    expect(screen.getByLabelText('Text').textContent).toBe('hi');
    // 装飾 tab.
    openTab('Style');
    expect((screen.getByLabelText('Font size') as HTMLInputElement).value).toBe('24');
    expect(screen.getByLabelText('Weight')).toBeDefined();
    expect((screen.getByLabelText('heading') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('muted') as HTMLInputElement).checked).toBe(false);
    // 配置 tab.
    openTab('Layout');
    expect(screen.getByLabelText('Width')).toBeDefined();
  });

  it('offers the style enums in the reader\u2019s language, committing the spelling', () => {
    // The localization is threaded per call site, so a dropped `optionLabel`
    // prop would silently fall back to the wire spellings here alone.
    const controller = makeController({
      [PATH]: { type: 'text', text: 'hi', style: {}, styleNames: [] },
      styles: {},
      formats: {},
    });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    openTab('Style');
    const weight = screen.getByLabelText('Weight') as HTMLSelectElement;
    expect(Array.from(weight.options, (o) => o.textContent)).toContain('Bold');
    fireEvent.change(weight, { target: { value: 'bold' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['style', 'fontWeight'],
      value: 'bold',
    });
  });

  it('dispatches a setScalar when the text editor is committed', () => {
    const controller = makeController({ [PATH]: { type: 'text', text: 'hi' } });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    const input = screen.getByLabelText('Text');
    input.textContent = 'bye';
    fireEvent.blur(input);
    // The commit is a BATCH (the text plus any declarations its chips
    // staged), so one undo step covers both even when nothing was staged.
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: PATH, keys: ['text'], value: 'bye' },
    ]);
  });

  it('threads the binding options into the text editor as chip labels', () => {
    const controller = makeController({
      [PATH]: { type: 'text', text: 'To: {customer.name}' },
    });
    const definitions = [
      'version: "0.2.0"',
      'type: object',
      'properties:',
      '  customer:',
      '    type: object',
      '    properties:',
      '      name:',
      '        type: string',
      '        title: 顧客名',
      '        example: 山田太郎',
    ].join('\n');
    draw(<PropertyPanel controller={controller} path={PATH} definitions={definitions} />);
    const chip = screen.getByLabelText('Text').querySelector('.sj-chip');
    expect(chip?.textContent).toBe('顧客名');
    expect(chip?.getAttribute('title')).toContain('山田太郎');
  });

  it('offers row-relative chips for a text item inside an iterable sub-template', () => {
    const nestedPath = `${PATH}.item.items[0]`;
    const controller = makeController({
      [PATH]: { type: 'repeat_flow', data: { key: 'items' } },
      [nestedPath]: { type: 'text', text: '{name}' },
    });
    const definitions = [
      'version: "0.2.0"',
      'type: object',
      'properties:',
      '  items:',
      '    type: array',
      '    title: 明細',
      '    items:',
      '      type: object',
      '      properties:',
      '        name:',
      '          type: string',
      '          title: 品名',
      '          example: りんご',
    ].join('\n');
    draw(<PropertyPanel controller={controller} path={nestedPath} definitions={definitions} />);
    const chip = screen.getByLabelText('Text').querySelector('.sj-chip');
    expect(chip?.textContent).toBe('品名');
  });

  describe('binding declarations in the chip editor', () => {
    const CELL = `${PATH}.columns[0].cell.items[0]`;
    const DEFINITIONS = [
      'properties:',
      '  store_name: { type: string, title: 店舗名, example: 青山店 }',
      '  items:',
      '    type: array',
      '    items:',
      '      type: object',
      '      properties:',
      '        品名: { type: string, title: 品名 }',
      '',
    ].join('\n');

    function cellController(cell: Record<string, unknown>) {
      return makeController({
        [PATH]: { type: 'table', data: { key: 'items' } },
        [CELL]: cell,
      });
    }

    function drawCell(controller: EditorController, capabilities?: readonly string[]) {
      draw(
        <PropertyPanel
          controller={controller}
          path={CELL}
          definitions={DEFINITIONS}
          capabilities={capabilities}
        />,
      );
    }

    it('authors the declaration and the text as ONE batch', () => {
      const controller = cellController({ type: 'text', text: '' });
      drawCell(controller);
      fireEvent.click(screen.getByRole('button', { name: 'Insert a data field' }));
      // A document-scope field a table cell could never reach with the bare
      // `{key}` grammar — the declaration is what makes it expressible.
      fireEvent.click(screen.getByRole('menuitem', { name: /店舗名/ }));
      fireEvent.blur(screen.getByLabelText('Text'));
      expect(controller.applyAll).toHaveBeenCalledWith([
        { op: 'setScalar', path: CELL, keys: ['text'], value: '{store_name1}' },
        {
          op: 'putValue',
          path: CELL,
          keys: ['bindings', 'store_name1'],
          value: { key: 'store_name', scope: 'document' },
        },
      ]);
    });

    it('declares a key the interpolation charset cannot spell', () => {
      const controller = cellController({ type: 'text', text: '' });
      drawCell(controller);
      fireEvent.click(screen.getByRole('button', { name: 'Insert a data field' }));
      fireEvent.click(screen.getByRole('menuitem', { name: /品名/ }));
      fireEvent.blur(screen.getByLabelText('Text'));
      expect(controller.applyAll).toHaveBeenCalledWith([
        { op: 'setScalar', path: CELL, keys: ['text'], value: '{f1}' },
        { op: 'putValue', path: CELL, keys: ['bindings', 'f1'], value: { key: '品名' } },
      ]);
    });

    it('removes the declaration of a chip the edit deleted, in the same batch', () => {
      const controller = cellController({
        type: 'text',
        text: '{f1}',
        bindings: { f1: { key: '品名' } },
      });
      drawCell(controller);
      const editor = screen.getByLabelText('Text');
      editor.textContent = '';
      fireEvent.blur(editor);
      expect(controller.applyAll).toHaveBeenCalledWith([
        { op: 'removeKey', path: CELL, keys: ['text'] },
        { op: 'removeKey', path: CELL, keys: ['bindings', 'f1'] },
      ]);
    });

    it('offers neither section nor unsafe key against an engine without declarations', () => {
      drawCell(cellController({ type: 'text', text: '' }), ['binding.scope']);
      fireEvent.click(screen.getByRole('button', { name: 'Insert a data field' }));
      expect(screen.queryByText('Document data')).toBeNull();
      expect(screen.queryByRole('menuitem', { name: /店舗名/ })).toBeNull();
      // 品名 is a row field here, but its key cannot spell `{品名}`.
      expect(screen.queryByRole('menuitem', { name: /品名/ })).toBeNull();
    });

    it('labels an existing declared chip even without the capability', () => {
      // Reading is display honesty: an externally authored declaration must
      // still say which field its chip stands for.
      drawCell(cellController({ type: 'text', text: '{f1}', bindings: { f1: { key: '品名' } } }), [
        'binding.scope',
      ]);
      expect(screen.getByLabelText('Text').querySelector('.sj-chip')?.textContent).toBe('品名');
    });
  });

  it('authors a bare number for a length field', () => {
    const controller = makeController({ [PATH]: { type: 'text', style: {} } });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    openTab('Style');
    fireEvent.blur(screen.getByLabelText('Font size'), { target: { value: '30' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['style', 'fontSize'],
      value: 30,
    });
  });

  it('authors a plain string for a text-kind style field', () => {
    const controller = makeController({ [PATH]: { type: 'text', style: {} } });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    openTab('Style');
    fireEvent.blur(screen.getByLabelText('Font family'), { target: { value: 'serif' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['style', 'fontFamily'],
      value: 'serif',
    });
  });

  it('dispatches nothing when a number field gets a non-numeric value', () => {
    const controller = makeController({ [PATH]: { type: 'text', style: {} } });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    openTab('Style');
    fireEvent.blur(screen.getByLabelText('Line height'), { target: { value: 'abc' } });
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('sets an enum value from a select and clears on the none option', () => {
    const controller = makeController({ [PATH]: { type: 'text', style: {} } });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    openTab('Style');
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: 'bold' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['style', 'fontWeight'],
      value: 'bold',
    });
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: PATH,
      keys: ['style', 'fontWeight'],
    });
  });

  it('adds and removes styleNames via the registry checkboxes', () => {
    const controller = makeController({
      [PATH]: { type: 'text', styleNames: ['heading'] },
      styles: { heading: {}, muted: {} },
    });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    openTab('Style');
    fireEvent.click(screen.getByLabelText('muted'));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setStrings',
      path: PATH,
      keys: ['styleNames'],
      values: ['heading', 'muted'],
    });
    fireEvent.click(screen.getByLabelText('heading'));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: PATH,
      keys: ['styleNames'],
    });
  });

  it('shows an empty note when no styles registry exists', () => {
    const controller = makeController({ [PATH]: { type: 'text' } });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    openTab('Style');
    // The styleNames field renders its empty placeholder.
    const group = screen.getByRole('group', { name: 'Styles' });
    expect(group.textContent).toContain('(default)');
  });

  // Flipping 内容の種類 by mistake used to empty the field: the switch dropped
  // whichever content key was there and seeded the other one blank.
  it('carries a lone binding across a content-mode switch, both ways', () => {
    const controller = makeController({
      [PATH]: { type: 'text', text: '{total:symbol}' },
      formats: {},
    });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    fireEvent.change(screen.getByLabelText('Content source'), { target: { value: 'data' } });
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'removeKey', path: PATH, keys: ['text'] },
      { op: 'setScalar', path: PATH, keys: ['data', 'key'], value: 'total' },
      { op: 'setScalar', path: PATH, keys: ['data', 'format'], value: 'symbol' },
    ]);
  });

  it('offers back the mixed text no binding could hold, on the way back', () => {
    // `{customer.name} 様` is not one field, so the switch to data has to drop
    // it — but switching straight back must not cost the reader the sentence.
    const controller = makeController({
      [PATH]: { type: 'text', text: '{customer.name} 様' },
      formats: {},
    });
    const { rerender } = draw(<PropertyPanel controller={controller} path={PATH} />);
    fireEvent.change(screen.getByLabelText('Content source'), { target: { value: 'data' } });
    // The document now reads as a binding; the panel re-renders over it.
    const bound = makeController(
      { [PATH]: { type: 'text', data: { key: '' } }, formats: {} },
      { applyAll: controller.applyAll },
    );
    rerender(
      <I18nProvider locale="en">
        <PropertyPanel controller={bound} path={PATH} />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByLabelText('Content source'), { target: { value: 'text' } });
    expect(controller.applyAll).toHaveBeenLastCalledWith([
      { op: 'removeKey', path: PATH, keys: ['data'] },
      { op: 'setScalar', path: PATH, keys: ['text'], value: '{customer.name} 様' },
    ]);
  });

  it('keeps nothing when the text it drops is empty', () => {
    const controller = makeController({ [PATH]: { type: 'text', text: '' }, formats: {} });
    const { rerender } = draw(<PropertyPanel controller={controller} path={PATH} />);
    fireEvent.change(screen.getByLabelText('Content source'), { target: { value: 'data' } });
    const bound = makeController(
      { [PATH]: { type: 'text', data: { key: '' } }, formats: {} },
      { applyAll: controller.applyAll },
    );
    rerender(
      <I18nProvider locale="en">
        <PropertyPanel controller={bound} path={PATH} />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByLabelText('Content source'), { target: { value: 'text' } });
    expect(controller.applyAll).toHaveBeenLastCalledWith([
      { op: 'removeKey', path: PATH, keys: ['data'] },
      { op: 'setScalar', path: PATH, keys: ['text'], value: '' },
    ]);
  });

  it('edits a data binding key and clears the format', () => {
    const controller = makeController({
      [PATH]: { type: 'text', data: { key: 'total', format: 'currency' } },
      formats: { currency: {}, wareki: {} },
    });
    const { container } = draw(<PropertyPanel controller={controller} path={PATH} />);
    expect((screen.getByLabelText('Data key') as HTMLInputElement).value).toBe('total');
    // The format picker offers every template `formats:` registry name, then
    // the builtin suggestions (generic set — no definitions here, so the bound
    // field's type is unresolved), deduped, in that order.
    fireEvent.click(screen.getByRole('button', { name: 'Choose a format' }));
    const spellings = Array.from(container.querySelectorAll('[role="menuitem"] code')).map(
      (c) => c.textContent,
    );
    expect(spellings).toEqual(['currency', 'wareki', 'date', 'datetime', 'percentage', 'quantity']);
    fireEvent.blur(screen.getByLabelText('Data key'), { target: { value: 'amount' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['data', 'key'],
      value: 'amount',
    });
    fireEvent.blur(screen.getByLabelText('Format'), { target: { value: '' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: PATH,
      keys: ['data', 'format'],
    });
  });

  it('edits the blank-form placeholder and clears it on empty', () => {
    const controller = makeController({
      [PATH]: { type: 'text', data: { key: 'birth_date', placeholder: '既存' } },
    });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    const field = screen.getByLabelText('Blank placeholder') as HTMLInputElement;
    expect(field.value).toBe('既存');
    fireEvent.blur(field, { target: { value: '　年　月　日' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['data', 'placeholder'],
      value: '　年　月　日',
    });
    fireEvent.blur(field, { target: { value: '' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'removeKey',
      path: PATH,
      keys: ['data', 'placeholder'],
    });
  });

  it('hides the placeholder field when the engine lacks the capability', () => {
    const controller = makeController({
      [PATH]: { type: 'text', data: { key: 'birth_date' } },
    });
    draw(<PropertyPanel controller={controller} path={PATH} capabilities={['text']} />);
    expect(screen.queryByLabelText('Blank placeholder')).toBeNull();
    // The data-key field still renders — only the gated field is hidden.
    expect(screen.getByLabelText('Data key')).not.toBeNull();
  });

  it('shows the placeholder field when the capability is present', () => {
    const controller = makeController({
      [PATH]: { type: 'text', data: { key: 'birth_date' } },
    });
    draw(
      <PropertyPanel controller={controller} path={PATH} capabilities={['binding.placeholder']} />,
    );
    expect(screen.getByLabelText('Blank placeholder')).not.toBeNull();
  });

  it('gates the number-field currency variants on the engine capability', () => {
    // The threading matters, not just the model fn: the panel must pass its
    // `capabilities` into formatOptions, or an older engine's picker would
    // bait a live `unknown_format_variant` warning.
    const numberDefs = ['properties:', '  amount:', '    type: number', '    title: 金額', ''].join(
      '\n',
    );
    const spellings = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('[role="menuitem"] code')).map((c) => c.textContent);
    const first = draw(
      <PropertyPanel
        controller={makeController({ [PATH]: { type: 'text', data: { key: 'amount' } } })}
        path={PATH}
        definitions={numberDefs}
        capabilities={['text']}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a format' }));
    expect(spellings(first.container)).toEqual(['currency', 'percentage', 'quantity']);
    first.unmount();
    const second = draw(
      <PropertyPanel
        controller={makeController({ [PATH]: { type: 'text', data: { key: 'amount' } } })}
        path={PATH}
        definitions={numberDefs}
        capabilities={['format.currency.coerce']}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a format' }));
    expect(spellings(second.container)).toEqual([
      'currency',
      'symbol',
      'name',
      'percentage',
      'quantity',
    ]);
  });

  it('switches content mode through an applyAll batch', () => {
    const controller = makeController({ [PATH]: { type: 'text', text: 'hi' } });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    fireEvent.change(screen.getByLabelText('Content source'), { target: { value: 'data' } });
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'removeKey', path: PATH, keys: ['text'] },
      { op: 'setScalar', path: PATH, keys: ['data', 'key'], value: '' },
    ]);
  });

  it('renders a rect item without a content section', () => {
    const controller = makeController({ [PATH]: { type: 'rect', style: {}, box: { w: 100 } } });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    // A rect has no 内容 tab; 装飾 is the first (active) tab.
    expect(screen.queryByRole('tab', { name: 'Content' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Style' })).toBeDefined();
    openTab('Layout');
    expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('100');
  });

  it('edits a qr_code item through the same content section as text', () => {
    const controller = makeController({
      [PATH]: { type: 'qr_code', text: 'https://example.com', box: { w: 60, h: 60 } },
    });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    expect(screen.getByRole('heading', { name: 'Content' })).toBeDefined();
    // A qr_code is a boxed item, so it now carries a 装飾 tab (fill + border),
    // but no typography.
    expect(screen.getByRole('tab', { name: 'Style' })).toBeTruthy();
    const qrText = screen.getByLabelText('Text');
    qrText.textContent = 'https://shojiku.dev';
    fireEvent.blur(qrText);
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: PATH, keys: ['text'], value: 'https://shojiku.dev' },
    ]);
  });

  it('edits a page number’s pattern, and clears it back to the engine default', () => {
    const controller = makeController({
      [PATH]: { type: 'page_number', box: {}, format: '- {page} -' },
    });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    const field = screen.getByLabelText('Pattern') as HTMLInputElement;
    expect(field.value).toBe('- {page} -');
    // The hint names both tokens, with its braces surviving the ICU pass.
    expect(screen.getByText(/\{page\} for this page/)).toBeTruthy();

    fireEvent.blur(field, { target: { value: 'p.{page}' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['format'],
      value: 'p.{page}',
    });

    fireEvent.blur(field, { target: { value: '' } });
    expect(controller.apply).toHaveBeenLastCalledWith({
      op: 'removeKey',
      path: PATH,
      keys: ['format'],
    });
  });

  it('does not rewrite a pattern that was only tabbed through', () => {
    const controller = makeController({
      [PATH]: { type: 'page_number', box: {}, format: '- {page} -' },
    });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    fireEvent.blur(screen.getByLabelText('Pattern'), { target: { value: '- {page} -' } });
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('offers a page_break only its presence binding — no field that would be invalid', () => {
    // `page_break` takes only `id` and `visible:` on the wire, so every OTHER
    // field the panel could show would author a key the engine rejects —
    // including the box fields this panel used to offer. The presence binding
    // is the exception, and it is what makes a conditional break authorable.
    const controller = makeController({ [PATH]: { type: 'page_break' } });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    expect(screen.queryByRole('heading', { name: 'Style' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Content' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Image' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Box' })).toBeNull();
    expect(screen.getByText('Show only when…')).toBeDefined();
  });

  it('gives a line a 装飾 tab carrying its own stroke controls', () => {
    // A line has no border BOX, but it does have decoration — and the insert
    // menu can create one, so the panel must be able to re-style it.
    const controller = makeController({
      [PATH]: { type: 'line', from: { x: 0, y: 0 }, to: { x: 100, y: 0 } },
    });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    expect(screen.getByRole('heading', { name: 'Style' })).toBeDefined();
    expect(screen.getByLabelText('Line type')).toBeDefined();
    expect(screen.getByLabelText('Line width')).toBeDefined();
    // The border cluster stays absent: a line has no border box to decorate.
    expect(screen.queryByLabelText('Corner radius')).toBeNull();
  });

  it('edits a line ENDPOINT from the 配置 tab, never a box key', () => {
    // A `line` draws from `from`/`to` and its wire struct is
    // `deny_unknown_fields`, so the `box.x` this tab used to write broke the
    // document. The tab now authors the endpoint the user actually meant.
    const controller = makeController({
      [PATH]: { type: 'line', from: { x: 0, y: 2 }, to: { x: 100, y: 2 } },
    });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    openTab('Layout');
    expect(screen.queryByLabelText('X')).toBeNull();
    fireEvent.blur(screen.getByLabelText('Start X'), { target: { value: '5' } });
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: PATH, keys: ['from', 'x'], value: 5 },
    ]);
  });
});

describe('PropertyPanel — binding field picker', () => {
  const DEFS = [
    'properties:',
    '  order:',
    '    type: object',
    '    properties:',
    '      code: { type: string, title: 注文コード, example: ORD-1 }',
    '  items:',
    '    type: array',
    '    items:',
    '      type: object',
    '      properties:',
    '        name: { type: string, title: 品名 }',
    '',
  ].join('\n');
  const PARAMS = JSON.stringify({ order: { code: 'ORD-9' }, items: [{ name: 'りんご' }] });

  it('offers document-scope fields with live sample values; picking commits ONE op', () => {
    const controller = makeController({
      [PATH]: { type: 'text', data: { key: '' } },
    });
    draw(<PropertyPanel controller={controller} path={PATH} definitions={DEFS} params={PARAMS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    const row = screen.getByRole('menuitem', { name: /注文コード/ });
    expect(row.textContent).toContain('ORD-9');
    fireEvent.click(row);
    expect(controller.apply).toHaveBeenCalledTimes(1);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['data', 'key'],
      value: 'order.code',
    });
  });

  it('offers ROW-relative fields for an item inside a table column cell', () => {
    const cellPath = 'sections.body.items[0].columns[0].cell.items[0]';
    const controller = makeController({
      'sections.body.items[0]': { type: 'table', data: { key: 'items' } },
      [cellPath]: { type: 'text', data: { key: '' } },
    });
    draw(
      <PropertyPanel controller={controller} path={cellPath} definitions={DEFS} params={PARAMS} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    const row = screen.getByRole('menuitem', { name: /品名/ });
    expect(row.textContent).toContain('りんご');
    // Both scopes are offered, under headings that say which is which.
    expect(screen.getByText("This row's data")).not.toBeNull();
    expect(screen.getByText('Document data')).not.toBeNull();
    expect(screen.queryByRole('menuitem', { name: /注文コード/ })).not.toBeNull();
    fireEvent.click(row);
    // A row pick authors the key alone: the item carries no `data.scope`, so
    // clearing one would fail `key_not_found` and roll the batch back.
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: cellPath, keys: ['data', 'key'], value: 'name' },
    ]);
  });

  it('suggests the currency variants for a currency-typed binding', () => {
    const moneyDefs = [
      'properties:',
      '  total:',
      '    type: number',
      '    format: currency',
      '    title: 合計',
      '',
    ].join('\n');
    const controller = makeController({
      [PATH]: { type: 'text', data: { key: 'total' } },
      formats: { tax: {} },
    });
    const { container } = draw(
      <PropertyPanel controller={controller} path={PATH} definitions={moneyDefs} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a format' }));
    const spellings = Array.from(container.querySelectorAll('[role="menuitem"] code')).map(
      (c) => c.textContent,
    );
    // Registry name first, then the currency variants for the currency-typed
    // binding (localized labels come from the catalog; the wire spelling shows
    // in the `<code>`).
    expect(spellings).toEqual(['tax', 'symbol', 'name']);
  });

  it('hides the format field until a data key is picked', () => {
    const controller = makeController({
      [PATH]: { type: 'text', data: { key: '' } },
      formats: {},
    });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    // A data binding with no key yet: the picker shows, the format field does not.
    expect(screen.getByLabelText('Data key')).toBeTruthy();
    expect(screen.queryByLabelText('Format')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Choose a format' })).toBeNull();
  });

  it('shows the format field once a data key is present', () => {
    const controller = makeController({
      [PATH]: { type: 'text', data: { key: 'total' } },
      formats: {},
    });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    expect(screen.getByLabelText('Format')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose a format' })).toBeTruthy();
  });

  it('steps the font size by 1pt through the style stepper', () => {
    const controller = makeController({
      [PATH]: { type: 'text', text: 'hi', style: { fontSize: 24 } },
    });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    openTab('Style');
    // fontSize is the first length/number style field; its ▲ steps 24 → 25.
    fireEvent.click(screen.getAllByRole('button', { name: 'Increase' })[0]);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['style', 'fontSize'],
      value: 25,
    });
  });

  it('renders box steppers that step the value by the grid step', () => {
    const controller = makeController({ [PATH]: { type: 'text', text: 'hi', box: { x: 8 } } });
    draw(<PropertyPanel controller={controller} path={PATH} gridStep={8} />);
    openTab('Layout');
    // The X axis is the first box field; its ▲ steps 8 → 16.
    const up = screen.getAllByRole('button', { name: 'Increase' })[0];
    fireEvent.click(up);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'x'],
      value: 16,
    });
  });

  it('keeps free entry working without definitions (empty picker state)', () => {
    const controller = makeController({
      [PATH]: { type: 'text', data: { key: 'total' } },
    });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.getByText('No data fields to choose from.')).toBeTruthy();
    fireEvent.blur(screen.getByLabelText('Data key'), { target: { value: 'amount' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['data', 'key'],
      value: 'amount',
    });
  });

  it('edits a data-bound image item through the same picker', () => {
    const controller = makeController({
      [PATH]: { type: 'image', data: { key: 'order.logo' } },
    });
    draw(<PropertyPanel controller={controller} path={PATH} definitions={DEFS} params={PARAMS} />);
    expect((screen.getByLabelText('Data key') as HTMLInputElement).value).toBe('order.logo');
    fireEvent.blur(screen.getByLabelText('Data key'), { target: { value: 'order.code' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['data', 'key'],
      value: 'order.code',
    });
  });

  it('edits a src-based image: fit mode + box, no data-key picker', () => {
    const controller = makeController({
      [PATH]: { type: 'image', src: 'data:image/png;base64,QUJD', fit: 'contain' },
    });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    expect(screen.queryByLabelText('Data key')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Image' })).toBeTruthy();
    // A glanceable summary, never the raw data URI.
    expect(screen.getByText(/PNG/)).toBeTruthy();
    // The generic box section serves the image's required w/h (配置 tab).
    openTab('Layout');
    expect(screen.getByLabelText('Width')).toBeTruthy();
    expect(screen.getByLabelText('Height')).toBeTruthy();
    openTab('Content');
    fireEvent.change(screen.getByLabelText('Fit mode'), { target: { value: 'stretch' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['fit'],
      value: 'stretch',
    });
  });

  it('hides the cover/none fit modes without the image.fit.cover_none capability', () => {
    const controller = makeController({
      [PATH]: { type: 'image', src: 'data:image/jpeg;base64,QUJD' },
    });
    draw(<PropertyPanel controller={controller} path={PATH} capabilities={['image']} />);
    const options = Array.from(
      (screen.getByLabelText('Fit mode') as HTMLSelectElement).options,
      (o) => o.value,
    );
    expect(options).not.toContain('cover');
    expect(options).not.toContain('none');
    expect(options).toContain('stretch');
  });

  it('offers the replace button only when the host injects the import callback', () => {
    const onReplaceImage = vi.fn();
    const controller = makeController({
      [PATH]: { type: 'image', src: 'data:image/png;base64,QUJD' },
    });
    const { rerender } = draw(<PropertyPanel controller={controller} path={PATH} />);
    expect(screen.queryByRole('button', { name: 'Replace image…' })).toBeNull();
    rerender(
      <I18nProvider locale="en">
        <PropertyPanel controller={controller} path={PATH} onReplaceImage={onReplaceImage} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Replace image…' }));
    expect(onReplaceImage).toHaveBeenCalledWith(PATH, expect.any(Number));
  });

  it('shows the no-source note for an image with neither src nor data', () => {
    const controller = makeController({ [PATH]: { type: 'image', box: {} } });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    expect(screen.getByText('No image source set.')).toBeTruthy();
  });
});

describe('PropertyPanel — effective-value hints + document-settings jump', () => {
  it('shows a named-style origin hint on an unset field and jumps to the styles section', () => {
    const onNavigateDefaults = vi.fn();
    const controller = makeController({
      [PATH]: { type: 'text', style: {}, styleNames: ['heading'] },
      styles: { heading: { fontSize: 40 } },
    });
    draw(
      <PropertyPanel controller={controller} path={PATH} onNavigateDefaults={onNavigateDefaults} />,
    );
    openTab('Style');
    // fontSize is unset on the item but resolves through the named style.
    expect((screen.getByLabelText('Font size') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('From style "heading"')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Document settings' }));
    expect(onNavigateDefaults).toHaveBeenCalledWith('styles');
  });

  it('shows a document-defaults origin hint and jumps to the defaults section', () => {
    const onNavigateDefaults = vi.fn();
    const controller = makeController({
      [PATH]: { type: 'text', style: {} },
      styles: {},
      defaults: { style: { fontSize: 20 } },
    });
    draw(
      <PropertyPanel controller={controller} path={PATH} onNavigateDefaults={onNavigateDefaults} />,
    );
    openTab('Style');
    expect(screen.getByText('From document defaults')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Document settings' }));
    expect(onNavigateDefaults).toHaveBeenCalledWith('defaults');
  });

  it('shows no origin hint when the field carries its own value', () => {
    const controller = makeController({
      [PATH]: { type: 'text', style: { fontSize: 24 } },
      styles: {},
    });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    openTab('Style');
    expect(screen.queryByRole('button', { name: 'Document settings' })).toBeNull();
  });

  it('clamps the active tab to the first when the selection changes to a shape without it', () => {
    const textController = makeController({
      [PATH]: { type: 'text', style: {} },
      styles: {},
      formats: {},
    });
    const { rerender } = draw(<PropertyPanel controller={textController} path={PATH} />);
    // Move off the default 内容 tab to 装飾.
    openTab('Style');
    expect(screen.getByRole('heading', { name: 'Style' })).toBeTruthy();
    // Re-select a repeat_flow (same panel instance): it has no 装飾 tab, so the
    // active tab clamps to the first (内容 → the data-source section), never a
    // blank.
    const flowController = makeController({
      [PATH]: { type: 'repeat_flow', data: { key: 'rows' }, item: { items: [] } },
      styles: {},
      formats: {},
    });
    rerender(
      <I18nProvider locale="en">
        <PropertyPanel controller={flowController} path={PATH} />
      </I18nProvider>,
    );
    expect(screen.queryByRole('tab', { name: 'Style' })).toBeNull();
    expect(screen.getByText('Data source')).toBeTruthy();
  });
});

describe('PropertyPanel — 塗り・枠線 cluster', () => {
  it('authors a fill color from the panel swatch (no hand-typed hex)', () => {
    const controller = makeController({ [PATH]: { type: 'rect', style: {}, box: { w: 50 } } });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    // A rect's first tab is 装飾. Fill + border show; no typography fields.
    expect(screen.queryByLabelText('Font size')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Background' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '#1d4ed8' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['style', 'backgroundColor'],
      value: '#1d4ed8',
    });
  });

  it('authors a text color from the panel swatch for a text item', () => {
    const controller = makeController({ [PATH]: { type: 'text', style: {} } });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    openTab('Style');
    fireEvent.click(screen.getByRole('button', { name: 'Color' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '#b91c1c' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['style', 'color'],
      value: '#b91c1c',
    });
  });

  it('authors an outer-frame border from the panel diagram (via applyAll)', () => {
    const controller = makeController({ [PATH]: { type: 'rect', style: {}, box: { w: 50 } } });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    fireEvent.click(screen.getByRole('button', { name: 'All sides' }));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: PATH, keys: ['style', 'borderWidth'], value: 1 },
    ]);
  });

  it('shows the row-conditions section on a table when the engine supports it', () => {
    const controller = makeController({
      [PATH]: {
        type: 'table',
        data: { key: 'rows' },
        columns: [{ data: { key: 'a' } }],
        row: { conditionalStyles: [{ when: { key: 'kind', equals: 'heading' } }] },
      },
    });
    draw(
      <PropertyPanel
        controller={controller}
        path={PATH}
        capabilities={['style.backgroundColor', 'style.border', 'table.row.conditionalStyles']}
      />,
    );
    openTab('Style');
    expect(screen.getByRole('button', { name: '+ Add a row condition' })).not.toBeNull();
  });

  it('hides the row-conditions section when the engine lacks the capability', () => {
    const controller = makeController({
      [PATH]: {
        type: 'table',
        data: { key: 'rows' },
        columns: [{ data: { key: 'a' } }],
        row: { conditionalStyles: [{ when: { key: 'kind' } }] },
      },
    });
    draw(
      <PropertyPanel
        controller={controller}
        path={PATH}
        capabilities={['style.backgroundColor', 'style.border']}
      />,
    );
    openTab('Style');
    expect(screen.queryByRole('button', { name: '+ Add a row condition' })).toBeNull();
    // The rest of the 装飾 tab still renders.
    expect(screen.getByRole('button', { name: 'Background' })).not.toBeNull();
  });

  it('offers no row fields on a table with no bound source', () => {
    // An unbound table has no row scope, so the picker offers nothing —
    // the section still renders (a rule can be added and bound later).
    const controller = makeController({
      [PATH]: { type: 'table', columns: [], row: { conditionalStyles: [{ when: { key: 'x' } }] } },
    });
    draw(
      <PropertyPanel
        controller={controller}
        path={PATH}
        capabilities={['style.backgroundColor', 'style.border', 'table.row.conditionalStyles']}
      />,
    );
    openTab('Style');
    expect(screen.getByRole('button', { name: '+ Add a row condition' })).not.toBeNull();
  });

  it('never shows the row-conditions section on a non-table item', () => {
    const controller = makeController({ [PATH]: { type: 'rect', box: { w: 50 } } });
    draw(<PropertyPanel controller={controller} path={PATH} />);
    openTab('Style');
    expect(screen.queryByRole('button', { name: '+ Add a row condition' })).toBeNull();
  });

  it('gates the fill swatch and border cluster by capability', () => {
    const controller = makeController({ [PATH]: { type: 'rect', style: {}, box: { w: 50 } } });
    draw(
      <PropertyPanel
        controller={controller}
        path={PATH}
        capabilities={['style.borderStyle', 'style.border.sides']}
      />,
    );
    // Neither style.backgroundColor nor style.border present.
    expect(screen.queryByRole('button', { name: 'Background' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'All sides' })).toBeNull();
  });
});

describe('PropertyPanel — container layout composition (配置 tab)', () => {
  const CONTAINER = 'sections.body.items[0]';
  const CHILD = `${CONTAINER}.items[0]`;

  function containerReads(): Record<string, unknown> {
    const child = { type: 'text', text: 'a' };
    return {
      'sections.body': { type: 'flow' },
      [CONTAINER]: {
        type: 'container',
        box: { direction: 'row', gap: 8 },
        items: [child, { type: 'text', text: 'b' }],
      },
      [CHILD]: child,
    };
  }

  it('shows the parent card FIRST for a container child, then its own placement', () => {
    const controller = makeController(containerReads());
    draw(<PropertyPanel controller={controller} path={CHILD} />);
    openTab('Layout');
    const card = screen.getByText('Parent container (side by side)').closest('section');
    expect(card).not.toBeNull();
    // Parent-first: the card precedes the own-placement heading in the DOM.
    const heading = screen.getByText('This item position');
    expect(
      (card as HTMLElement).compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The card's controls edit the PARENT (direction segment present).
    expect(screen.getByLabelText('Stack vertically')).toBeTruthy();
  });

  it('jumps the selection to the parent via the card button', () => {
    const onSelectPath = vi.fn();
    const controller = makeController(containerReads());
    draw(<PropertyPanel controller={controller} path={CHILD} onSelectPath={onSelectPath} />);
    openTab('Layout');
    fireEvent.click(screen.getByText('Select parent'));
    expect(onSelectPath).toHaveBeenCalledWith(CONTAINER);
  });

  it('reports highlight enter/leave for the hovered parent card', () => {
    const onHighlight = vi.fn();
    const controller = makeController(containerReads());
    draw(<PropertyPanel controller={controller} path={CHILD} onHighlight={onHighlight} />);
    openTab('Layout');
    const card = screen.getByText('Parent container (side by side)').closest('section');
    fireEvent.mouseEnter(card as HTMLElement);
    expect(onHighlight).toHaveBeenCalledWith(CONTAINER);
    fireEvent.mouseLeave(card as HTMLElement);
    expect(onHighlight).toHaveBeenLastCalledWith(null);
  });

  it('shows a selected container own placement + 子の並べ方 (no parent card at flow root)', () => {
    const controller = makeController(containerReads());
    draw(<PropertyPanel controller={controller} path={CONTAINER} />);
    openTab('Layout');
    expect(screen.queryByText(/Parent container/)).toBeNull();
    expect(screen.getByText('Container position')).toBeTruthy();
    expect(screen.getByText('Child layout')).toBeTruthy();
    // The 子の並べ方 controls target the container itself.
    expect(screen.getByLabelText('Ratio 1')).toBeTruthy();
  });

  it('keeps the plain 配置 heading and no layout sections for a non-container item', () => {
    const controller = makeController({
      'sections.body': { type: 'flow' },
      'sections.body.items[0]': { type: 'text', text: 'x' },
    });
    draw(<PropertyPanel controller={controller} path="sections.body.items[0]" />);
    openTab('Layout');
    expect(screen.getByText('Box')).toBeTruthy();
    expect(screen.queryByText('Child layout')).toBeNull();
    expect(screen.queryByText(/Parent container/)).toBeNull();
  });

  it('shows a nested container BOTH its parent card and its own 子の並べ方', () => {
    const inner = { type: 'container', box: { direction: 'row' }, items: [{ type: 'text' }] };
    const controller = makeController({
      'sections.body': { type: 'flow' },
      [CONTAINER]: { type: 'container', box: { direction: 'column' }, items: [inner] },
      [CHILD]: inner,
    });
    draw(<PropertyPanel controller={controller} path={CHILD} />);
    openTab('Layout');
    expect(screen.getByText('Parent container (stacked)')).toBeTruthy();
    expect(screen.getByText('Container position')).toBeTruthy();
    expect(screen.getByText('Child layout')).toBeTruthy();
  });

  it('offers the keyboard-reachable wrap action on the 配置 tab when armed', () => {
    const onWrap = vi.fn();
    const controller = makeController(containerReads());
    draw(<PropertyPanel controller={controller} path={CHILD} onWrap={onWrap} />);
    openTab('Layout');
    fireEvent.click(screen.getByText('Group into a container'));
    expect(onWrap).toHaveBeenCalledWith(CHILD);
  });

  it('shows no wrap action when the handler is absent (unwrappable selection)', () => {
    const controller = makeController(containerReads());
    draw(<PropertyPanel controller={controller} path={CHILD} />);
    openTab('Layout');
    expect(screen.queryByText('Group into a container')).toBeNull();
  });
});

describe('PropertyPanel — data-binding scope', () => {
  const TABLE = 'sections.body.items[0]';
  const CELL = `${TABLE}.columns[0].cell.items[0]`;
  const DEFS = [
    'properties:',
    '  store: { type: object, properties: { name: { type: string, title: 店舗名 } } }',
    '  items:',
    '    type: array',
    '    items:',
    '      type: object',
    '      properties:',
    '        name: { type: string, title: 品名 }',
    '',
  ].join('\n');

  function cell(node: Record<string, unknown>) {
    return makeController({
      [TABLE]: { type: 'table', data: { key: 'items' } },
      [CELL]: node,
    });
  }

  function drawCell(controller: EditorController, capabilities?: readonly string[]) {
    draw(
      <PropertyPanel
        controller={controller}
        path={CELL}
        definitions={DEFS}
        capabilities={capabilities}
      />,
    );
  }

  it('authors key AND scope for a document pick inside a cell', () => {
    const controller = cell({ type: 'text', data: { key: '' } });
    drawCell(controller);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /店舗名/ }));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: CELL, keys: ['data', 'key'], value: 'store.name' },
      { op: 'setScalar', path: CELL, keys: ['data', 'scope'], value: 'document' },
    ]);
  });

  it('drops the scope when the pick goes back to a row field', () => {
    const controller = cell({ type: 'text', data: { key: 'store.name', scope: 'document' } });
    drawCell(controller);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /品名/ }));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: CELL, keys: ['data', 'key'], value: 'name' },
      { op: 'removeKey', path: CELL, keys: ['data', 'scope'] },
    ]);
  });

  it('badges an authored scope EVEN against an engine that lacks the capability', () => {
    // Display honesty: the file says `scope: document`, so the panel says so.
    // Only the offer (and thus authoring) is gated.
    const controller = cell({ type: 'text', data: { key: 'store.name', scope: 'document' } });
    drawCell(controller, ['other.capability']);
    expect(screen.getByText('Document')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.queryByRole('menuitem', { name: /店舗名/ })).toBeNull();
    expect(screen.queryByText('Document data')).toBeNull();
  });

  it('gives a data-bound IMAGE in a cell the same escape', () => {
    const controller = cell({ type: 'image', data: { key: '' } });
    drawCell(controller);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /店舗名/ }));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: CELL, keys: ['data', 'key'], value: 'store.name' },
      { op: 'setScalar', path: CELL, keys: ['data', 'scope'], value: 'document' },
    ]);
  });

  it('gates the IMAGE picker on the capability too (its own threading)', () => {
    const controller = cell({ type: 'image', data: { key: 'store.name', scope: 'document' } });
    drawCell(controller, ['other.capability']);
    // Reading stays honest here as well; only the offer disappears.
    expect(screen.getByText('Document')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.queryByRole('menuitem', { name: /店舗名/ })).toBeNull();
  });

  it('shows no scope surface at all for an item at document scope', () => {
    const controller = makeController({ [PATH]: { type: 'text', data: { key: '' } } });
    draw(<PropertyPanel controller={controller} path={PATH} definitions={DEFS} />);
    expect(screen.queryByText('Document')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a data field' }));
    expect(screen.queryByText('Document data')).toBeNull();
    // A pick there is the plain one-op commit it has always been.
    fireEvent.click(screen.getByRole('menuitem', { name: /店舗名/ }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['data', 'key'],
      value: 'store.name',
    });
  });
});
