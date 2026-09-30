// Tests for styleSurfaces.ts — which types each text-and-box control is
// offered on. Each expectation is a row of the engine's own honouring matrix,
// read from the layout source; a type that ignores a key must not be offered it.

import { describe, expect, it } from 'vitest';
import {
  DECORATION_LINE_TYPES,
  LETTER_SPACING_TYPES,
  OPACITY_DECORATION_ONLY,
  OPACITY_TYPES,
  overflowKeyOf,
  PADDING_TYPES,
  TEXT_SURFACE_TYPES,
  textHelpKey,
  VALIGN_TYPES,
} from './styleSurfaces';

describe('styleSurfaces', () => {
  it('offers vertical alignment only where text_block reads it', () => {
    expect([...VALIGN_TYPES]).toEqual(['text', 'page_number']);
    for (const ignores of ['list', 'image', 'qr_code', 'container', 'char_grid', 'table']) {
      expect(VALIGN_TYPES.has(ignores)).toBe(false);
    }
  });

  it('routes each type to the overflow key it honours, or none', () => {
    expect(overflowKeyOf('text')).toBe('textOverflow');
    expect(overflowKeyOf('page_number')).toBe('textOverflow');
    expect(overflowKeyOf('container')).toBe('overflow');
    for (const ignores of ['list', 'image', 'rect', 'char_grid', 'table']) {
      expect(overflowKeyOf(ignores)).toBeNull();
    }
  });

  it('offers letter spacing where it is drawn or inherited, never on a char_grid', () => {
    for (const type of ['text', 'page_number', 'list', 'container', 'table']) {
      expect(LETTER_SPACING_TYPES.has(type), type).toBe(true);
    }
    expect(LETTER_SPACING_TYPES.has('char_grid')).toBe(false);
  });

  it('draws a decoration line on the three text surfaces only', () => {
    expect([...DECORATION_LINE_TYPES]).toEqual([...TEXT_SURFACE_TYPES]);
  });

  it('never offers opacity on a table (always opaque) or a line (its own shape)', () => {
    expect(OPACITY_TYPES.has('table')).toBe(false);
    expect(OPACITY_TYPES.has('line')).toBe(false);
    for (const only of OPACITY_DECORATION_ONLY) {
      expect(OPACITY_TYPES.has(only)).toBe(true);
    }
  });

  it('never offers padding where the engine has nothing to inset', () => {
    for (const ignores of ['rect', 'ellipse', 'checkbox']) {
      expect(PADDING_TYPES.has(ignores)).toBe(false);
    }
  });

  it('explains the text section only where it does something unexpected', () => {
    expect(textHelpKey('container')).toBe('panel.itemSection.text.inheritHelp');
    expect(textHelpKey('char_grid')).toBe('panel.itemSection.text.charGridHelp');
    expect(textHelpKey('text')).toBeUndefined();
  });
});
