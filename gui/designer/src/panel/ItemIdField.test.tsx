// The name field on a REAL editing session (an accepted commit shows a
// different document, which a mock controller cannot): what authors nothing
// first (an unchanged blur, Enter mid-IME-composition, a cancelled clear),
// then naming, the refusal that names the holder and reseeds, the impact line,
// the clear confirm, one undo restoring an id with its anchors, a non-string
// id left alone, and a namespace that cannot be read refusing rather than
// guessing.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type EditorController, useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { ItemIdField } from './ItemIdField';

afterEach(cleanup);

const DOC = `sections:
  body:
    items:
      - { type: text, id: total, text: Total }
      - { type: ellipse, anchor: total }
      - type: line
        from: { item: total }
        to: { x: 0, y: 0 }
      - { type: text, text: Plain }
      - type: table
        columns:
          - { id: qty, label: Qty }
          - { id: bare }
      - { type: text, id: 7 }
`;

const TOTAL = 'sections.body.items[0]';
const PLAIN = 'sections.body.items[3]';

function Harness({ path, source = DOC }: { path: string; source?: string }) {
  const editor = useEditor(source);
  return (
    <I18nProvider locale="en">
      <ItemIdField controller={editor} path={path} />
      <pre data-testid="doc">{editor.text}</pre>
      <span data-testid="can-undo">{String(editor.canUndo)}</span>
      <button type="button" data-testid="undo" onClick={editor.undo}>
        undo
      </button>
    </I18nProvider>
  );
}

const doc = () => screen.getByTestId('doc').textContent ?? '';
const field = () => screen.getByLabelText('Name (ID)') as HTMLInputElement;
const commit = (value: string) => fireEvent.blur(field(), { target: { value } });

describe('ItemIdField — what authors nothing', () => {
  it('an unchanged blur authors nothing', () => {
    render(<Harness path={TOTAL} />);
    expect(field().value).toBe('total');
    commit('total');
    commit(' total ');
    expect(screen.getByTestId('can-undo').textContent).toBe('false');
  });

  it('Enter confirming an IME conversion does not commit; a plain Enter does', () => {
    render(<Harness path={PLAIN} />);
    field().focus();
    field().value = 'note';
    fireEvent.keyDown(field(), { key: 'Enter', isComposing: true });
    expect(doc()).not.toContain('id: note');
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(doc()).toContain('{ type: text, text: Plain, id: note }');
  });
});

describe('ItemIdField — naming', () => {
  it('writes the trimmed name onto an unnamed node', () => {
    render(<Harness path={PLAIN} />);
    commit('  note ');
    expect(doc()).toContain('{ type: text, text: Plain, id: note }');
    expect(field().value).toBe('note');
  });

  it('refuses a name another node carries, names that node, and reseeds', () => {
    render(<Harness path={PLAIN} />);
    commit('qty');
    expect(
      screen.getByText('Another item (“Qty”) already has this name. Choose a different one.'),
    ).toBeTruthy();
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(field().value).toBe('');
    expect(screen.getByTestId('can-undo').textContent).toBe('false');
    // A holder with no label of its own is named by its kind, as the tree does.
    commit('bare');
    expect(screen.getByText(/Another item \(“Column”\)/)).toBeTruthy();
    // A good entry next clears the refusal.
    commit('plain');
    expect(screen.queryByText(/already has this name/)).toBeNull();
  });

  it('says how many anchors follow before a rename, and one undo restores them with the id', () => {
    render(<Harness path={TOTAL} />);
    const before = doc();
    expect(
      screen.getByText(
        'Circles and lines pointing to this name: 2. Renaming keeps them connected.',
      ),
    ).toBeTruthy();
    commit('sum');
    expect(doc()).toContain('id: sum');
    expect(doc()).toContain('anchor: sum');
    expect(doc()).toContain('from: { item: sum }');
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).toBe(before);
  });
});

describe('ItemIdField — clearing a name anchors use', () => {
  it('asks first; Cancel authors nothing and keeps the name', () => {
    render(<Harness path={TOTAL} />);
    const before = doc();
    commit('');
    expect(
      screen.getByText(
        "Circles and lines pointing to this name: 2. They won't be drawn without it.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Remove this name?')).toBeNull();
    expect(doc()).toBe(before);
    expect(field().value).toBe('total');
  });

  it('Remove name removes the id only, in one step', () => {
    render(<Harness path={TOTAL} />);
    const before = doc();
    commit('');
    fireEvent.click(screen.getByRole('button', { name: 'Remove name' }));
    expect(doc()).toContain('{ type: text, text: Total }');
    expect(doc()).toContain('anchor: total');
    fireEvent.click(screen.getByTestId('undo'));
    expect(doc()).toBe(before);
  });

  it('clears an unreferenced name with no dialog', () => {
    render(<Harness path="sections.body.items[4].columns[0]" />);
    commit('');
    expect(screen.queryByText('Remove this name?')).toBeNull();
    expect(doc()).toContain('{ label: Qty }');
  });
});

describe('ItemIdField — what it will not touch', () => {
  it('shows a non-string id as written, read-only, and authors nothing on blur', () => {
    render(<Harness path="sections.body.items[5]" />);
    expect(field().value).toBe('7');
    expect(field().readOnly).toBe(true);
    expect(screen.getByText(/in a form that can't be edited here/)).toBeTruthy();
    commit('seven');
    expect(screen.getByTestId('can-undo').textContent).toBe('false');
  });

  it('shows a non-scalar id as empty, read-only', () => {
    render(
      <Harness
        path={PLAIN}
        source={DOC.replace('{ type: text, text: Plain }', '{ type: text, id: [a], text: Plain }')}
      />,
    );
    expect(field().value).toBe('');
    expect(field().readOnly).toBe(true);
  });

  it('refuses rather than guesses when the namespace cannot be read', () => {
    const applyAll = vi.fn(() => ({ ok: true as const }));
    const controller = {
      revision: 0,
      read: (path: string) => {
        if (path === 'sections') {
          throw new Error('alias cap');
        }
        return path === PLAIN ? { type: 'text' } : undefined;
      },
      applyAll,
    } as unknown as EditorController;
    render(
      <I18nProvider locale="en">
        <ItemIdField controller={controller} path={PLAIN} />
      </I18nProvider>,
    );
    commit('note');
    expect(
      screen.getByText(
        'Name not changed: this document is too large to check where the name is used.',
      ),
    ).toBeTruthy();
    expect(applyAll).not.toHaveBeenCalled();
  });

  it('refuses to CLEAR a name when the namespace cannot be read, rather than skip the confirm', () => {
    const applyAll = vi.fn(() => ({ ok: true as const }));
    const controller = {
      revision: 0,
      read: (path: string) => {
        if (path === 'sections') {
          throw new Error('alias cap');
        }
        return path === PLAIN ? { type: 'text', id: 'total' } : undefined;
      },
      applyAll,
    } as unknown as EditorController;
    render(
      <I18nProvider locale="en">
        <ItemIdField controller={controller} path={PLAIN} />
      </I18nProvider>,
    );
    commit('');
    expect(screen.queryByText('Remove this name?')).toBeNull();
    expect(screen.getByText(/too large to check where the name is used/)).toBeTruthy();
    expect(applyAll).not.toHaveBeenCalled();
  });

  it('reads a node the materialization cap refuses as unnamed', () => {
    const controller = {
      revision: 0,
      read: () => {
        throw new Error('alias cap');
      },
      applyAll: vi.fn(),
    } as unknown as EditorController;
    render(
      <I18nProvider locale="en">
        <ItemIdField controller={controller} path={PLAIN} />
      </I18nProvider>,
    );
    expect(field().value).toBe('');
  });
});
