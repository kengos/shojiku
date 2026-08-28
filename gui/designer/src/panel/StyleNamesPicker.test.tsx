// The named-style picker as its own leaf. It was a block inlined in the decoration
// tab, so a type with no decoration tab could not reach it at all; these cases pin
// the behaviour that block had, at the seam it was lifted to.

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { StyleNamesPicker } from './StyleNamesPicker';

const P = 'sections.body.items[0]';

function makeController(styles: unknown): EditorController {
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: (path: string) => (path === 'styles' ? styles : undefined),
    undo: vi.fn(),
    redo: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setMaxBytes: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceDocument: vi.fn(),
  };
}

function draw(styles: unknown, styleNames: readonly string[], help?: ReactNode) {
  const controller = makeController(styles);
  render(
    <I18nProvider locale="en">
      <StyleNamesPicker controller={controller} path={P} styleNames={styleNames} help={help} />
    </I18nProvider>,
  );
  return controller;
}

const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

describe('StyleNamesPicker', () => {
  it('offers every name in the registry', () => {
    draw({ heading: {}, caption: {} }, []);
    expect(box('heading').checked).toBe(false);
    expect(box('caption').checked).toBe(false);
  });

  it('keeps showing a name the registry no longer carries, so it can be removed', () => {
    // An authored `styleNames` entry can outlive its registry entry (someone
    // deleted the style, or the document arrived that way). Hiding it would leave a
    // value on the wire that the panel can neither show nor unset.
    const controller = draw({ heading: {} }, ['gone']);
    expect(box('gone').checked).toBe(true);
    fireEvent.click(box('gone'));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'removeKey',
      path: P,
      keys: ['styleNames'],
    });
  });

  it('appends a ticked name, preserving the order already authored', () => {
    // The engine resolves `styleNames` in order and the LATER name wins, so the
    // order is meaning, not presentation.
    const controller = draw({ a: {}, b: {} }, ['a']);
    fireEvent.click(box('b'));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setStrings',
      path: P,
      keys: ['styleNames'],
      values: ['a', 'b'],
    });
  });

  it('drops one name of several without disturbing the rest', () => {
    const controller = draw({ a: {}, b: {}, c: {} }, ['a', 'b', 'c']);
    fireEvent.click(box('b'));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setStrings',
      path: P,
      keys: ['styleNames'],
      values: ['a', 'c'],
    });
  });

  it('says the registry is empty rather than rendering an empty group', () => {
    draw({}, []);
    expect(screen.getByText('(default)')).not.toBeNull();
  });

  it('survives a hostile `styles` value', () => {
    draw('not a map', ['kept']);
    expect(box('kept').checked).toBe(true);
  });

  it('names the styles in the order the REGISTRY declares them, not by precedence', () => {
    // The two orders are different and the `?` beside this control used to say
    // otherwise. Rendered order is `Object.keys(styles)`; precedence is the
    // `styleNames` ARRAY, walked backwards (`namedValue`), matching the engine's
    // `authored()`. Ticking APPENDS, so the array is click order. Pinned here so
    // a later edit either keeps the two apart or has to change the help copy
    // with it.
    draw({ heading: {}, caption: {} }, ['caption', 'heading']);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.map((b) => b.getAttribute('aria-label') ?? b.parentElement?.textContent)).toEqual([
      'heading',
      'caption',
    ]);
  });

  it('keeps the group named by its LABEL when a `?` is beside the legend', () => {
    // A `<fieldset>` is otherwise named by its legend's whole subtree, so a nested
    // help button would fold its own name into the group's. The explicit
    // `aria-label` is what stops that, and it is invisible until something is
    // actually rendered next to the label.
    draw({ heading: {} }, [], <button type="button">Why styles?</button>);
    expect(screen.getByRole('group', { name: 'Styles' })).not.toBeNull();
  });
});
