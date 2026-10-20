// The panel's hand-written engine facts against the engine's key catalog
// (`@shojiku/designer-core`'s reads of the committed `catalog.schema.json`).
// The catalog is the engine's own statement, generated from its fact tables, so
// a copy here that drifts from it reds HERE rather than shipping a control that
// changes nothing, or a default the page does not render.
//
// The invariant on the per-type sets is ONE-sided: every type a control is
// offered on must be a type the engine takes the key on. The other direction —
// a key the engine takes that the panel offers no control for — is a missing
// feature rather than a lie, and the generic panel built on the catalog closes
// those; the char_grid rows below are the two this change added.

import { itemStyleKeys, styleKeyFacts, styleKeys } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { effectiveValueIn } from '../toolbar/effective';
import { INHERITED_STYLE_FIELDS } from './defaultsModel';
import { ENGINE_STYLE_DEFAULTS } from './engineDefaults';
import {
  CHAR_GRID_GLYPH_KEYS,
  charGridTextKeys,
  DECORATION_LINE_TYPES,
  LETTER_SPACING_TYPES,
  OPACITY_TYPES,
  OVERFLOW_TYPES,
  TEXT_INHERIT_TYPES,
  TEXT_OVERFLOW_TYPES,
  TEXT_SURFACE_TYPES,
  VALIGN_TYPES,
} from './styleSurfaces';
import { TYPESETTING_KEYS, typesettingKeys } from './typesettingModel';

const takes = (type: string, key: string) => itemStyleKeys(type).includes(key);

describe('the panel against the key catalog', () => {
  it('offers each text and box control only where the engine takes the key', () => {
    const offered: readonly (readonly [ReadonlySet<string>, readonly string[]])[] = [
      [TEXT_SURFACE_TYPES, ['fontSize', 'fontFamily', 'lineHeight', 'color', 'textAlign']],
      [TEXT_INHERIT_TYPES, ['fontSize', 'fontFamily', 'lineHeight', 'color', 'textAlign']],
      [LETTER_SPACING_TYPES, ['letterSpacing']],
      [VALIGN_TYPES, ['verticalAlign']],
      [TEXT_OVERFLOW_TYPES, ['textOverflow']],
      [DECORATION_LINE_TYPES, ['textDecoration']],
      [OVERFLOW_TYPES, ['overflow']],
    ];
    for (const [types, keys] of offered) {
      for (const type of types) {
        for (const key of keys) {
          expect(takes(type, key), `${type} ${key}`).toBe(true);
        }
      }
    }
    // A line's alpha is its own stroke's, not a `Style` key.
    for (const type of [...OPACITY_TYPES].filter((t) => t !== 'line')) {
      expect(takes(type, 'opacity'), type).toBe(true);
    }
  });

  it('offers each typesetting key only where the engine takes it', () => {
    const types = ['text', 'page_number', 'table', 'container', 'list', 'char_grid'];
    for (const type of types) {
      const keys = typesettingKeys({ type, hasSpans: false, vertical: true }, undefined);
      expect(keys.length, type).toBeGreaterThan(0);
      for (const key of keys) {
        expect(takes(type, key), `${type} ${key}`).toBe(true);
      }
    }
  });

  it('gives a char_grid its glyph keys, its own alignment and tate-chu-yoko', () => {
    for (const key of charGridTextKeys(undefined)) {
      expect(takes('char_grid', key), key).toBe(true);
    }
    expect(charGridTextKeys(undefined)).toEqual([...CHAR_GRID_GLYPH_KEYS, 'textAlign']);
    expect(charGridTextKeys([])).toEqual(CHAR_GRID_GLYPH_KEYS);
    expect(
      typesettingKeys({ type: 'char_grid', hasSpans: false, vertical: true }, undefined),
    ).toEqual(['textCombineUpright']);
  });

  it('floors an unset key to the value the engine starts it at', () => {
    for (const [key, value] of Object.entries(ENGINE_STYLE_DEFAULTS)) {
      expect(String(styleKeyFacts(key)?.initial), key).toBe(value);
    }
  });

  it('inherits exactly the keys the engine inherits', () => {
    // Behavioural: an ancestor's value reaches the item through the cascade
    // mirror exactly when the engine says the key inherits.
    for (const key of styleKeys()) {
      const ctx = {
        item: {},
        registry: {},
        defaults: {},
        ancestors: [{ style: { [key]: 'x' } }],
        floor: {},
      };
      const reached = effectiveValueIn(ctx, key).origin === 'inherited';
      expect(reached, key).toBe(styleKeyFacts(key)?.inherited);
    }
    for (const field of INHERITED_STYLE_FIELDS) {
      expect(styleKeyFacts(field.key)?.inherited, field.key).toBe(true);
    }
    for (const key of TYPESETTING_KEYS) {
      expect(styleKeyFacts(key)?.inherited, key).toBe(true);
    }
  });
});
