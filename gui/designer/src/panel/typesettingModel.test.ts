// The typesetting key table: which keys each type's engine reads, which
// options a given engine takes, the `textCombineUpright` token codec (its map
// form included, hostile shapes degrading rather than throwing), and what a
// pick authors.

import { describe, expect, it } from 'vitest';
import {
  combineToken,
  TYPESETTING_KEYS,
  type TypesettingSubject,
  typesettingKeys,
  typesettingOp,
  typesettingOptions,
  UNREADABLE_COMBINE,
} from './typesettingModel';

const subject = (type: string, extra: Partial<TypesettingSubject> = {}): TypesettingSubject => ({
  type,
  hasSpans: false,
  vertical: false,
  ...extra,
});

/** Every capability the table gates on — an engine that has them all. */
const ALL = [
  'style.writingMode',
  'style.textOrientation',
  'style.textCombineUpright',
  'style.textCombineUpright.all',
  'style.lineBreak',
  'style.lineBreak.strict_loose',
  'style.textSpacingTrim',
  'style.hangingPunctuation',
  'style.writingMode.surfaces',
];
const without = (...gone: string[]) => ALL.filter((key) => !gone.includes(key));

describe('which keys a type is offered', () => {
  it('gives the text-drawing types and a container all six', () => {
    for (const type of ['text', 'page_number', 'table', 'container']) {
      expect(typesettingKeys(subject(type), undefined)).toEqual(TYPESETTING_KEYS);
    }
  });

  it('gives a list only the vertical three (its entries never wrap)', () => {
    expect(typesettingKeys(subject('list'), undefined)).toEqual([
      'writingMode',
      'textOrientation',
      'textCombineUpright',
    ]);
  });

  it('gives a char_grid, the shapes and the media nothing (they ignore the style keys)', () => {
    for (const type of ['char_grid', 'rect', 'ellipse', 'checkbox', 'line', 'image', 'qr_code']) {
      expect(typesettingKeys(subject(type), undefined)).toEqual([]);
    }
  });

  it('drops hanging punctuation from horizontal spans only', () => {
    expect(typesettingKeys(subject('text', { hasSpans: true }), undefined)).not.toContain(
      'hangingPunctuation',
    );
    expect(
      typesettingKeys(subject('text', { hasSpans: true, vertical: true }), undefined),
    ).toContain('hangingPunctuation');
  });

  it('reads an own-property table, so a hostile type name gets nothing', () => {
    expect(typesettingKeys(subject('__proto__'), undefined)).toEqual([]);
    expect(typesettingKeys(subject('constructor'), undefined)).toEqual([]);
  });
});

describe('the capability gates', () => {
  it('withholds each key its engine does not declare', () => {
    expect(typesettingKeys(subject('text'), [])).toEqual([]);
    expect(typesettingKeys(subject('text'), without('style.lineBreak'))).not.toContain('lineBreak');
    expect(typesettingKeys(subject('text'), without('style.textSpacingTrim'))).not.toContain(
      'textSpacingTrim',
    );
    expect(typesettingKeys(subject('text'), without('style.hangingPunctuation'))).not.toContain(
      'hangingPunctuation',
    );
  });

  it('needs the surfaces key for vertical writing past a plain text block', () => {
    const older = without('style.writingMode.surfaces');
    expect(typesettingKeys(subject('text'), older)).toContain('writingMode');
    expect(typesettingKeys(subject('container'), older)).toContain('writingMode');
    for (const type of ['page_number', 'table', 'list']) {
      expect(typesettingKeys(subject(type), older)).not.toContain('writingMode');
    }
    expect(typesettingKeys(subject('text', { hasSpans: true }), older)).not.toContain(
      'writingMode',
    );
    // The line-breaking keys are not vertical writing, so a page number keeps them.
    expect(typesettingKeys(subject('page_number'), older)).toContain('lineBreak');
  });

  it('needs the `all` key for tate-chu-yoko in a list or spans', () => {
    const older = without('style.textCombineUpright.all');
    expect(typesettingKeys(subject('list'), older)).not.toContain('textCombineUpright');
    expect(typesettingKeys(subject('text', { hasSpans: true }), older)).not.toContain(
      'textCombineUpright',
    );
    expect(typesettingKeys(subject('text'), older)).toContain('textCombineUpright');
    expect(typesettingKeys(subject('page_number'), older)).toContain('textCombineUpright');
  });

  it('offers strict/loose and `all` only behind their own keys', () => {
    expect(typesettingOptions('lineBreak', ALL)).toEqual(['normal', 'strict', 'loose', 'anywhere']);
    expect(typesettingOptions('lineBreak', without('style.lineBreak.strict_loose'))).toEqual([
      'normal',
      'anywhere',
    ]);
    expect(typesettingOptions('textCombineUpright', ALL)).toEqual([
      'none',
      'digits2',
      'digits3',
      'digits4',
      'all',
    ]);
    expect(
      typesettingOptions('textCombineUpright', without('style.textCombineUpright.all')),
    ).not.toContain('all');
    expect(typesettingOptions('writingMode', undefined)).toEqual(['horizontal_tb', 'vertical_rl']);
  });
});

describe('the textCombineUpright token codec', () => {
  it('reads the keywords and the digits map', () => {
    expect(combineToken('none')).toBe('none');
    expect(combineToken('all')).toBe('all');
    expect(combineToken({ digits: 2 })).toBe('digits2');
    expect(combineToken({ digits: 4 })).toBe('digits4');
  });

  it('keeps an integer outside the range as its own token', () => {
    expect(combineToken({ digits: 9 })).toBe('digits9');
  });

  it('reads an absent value as unset', () => {
    expect(combineToken(undefined)).toBe('');
    expect(combineToken(null)).toBe('');
  });

  it('reads a present shape the engine cannot parse as unreadable, never as unset or a throw', () => {
    for (const hostile of [
      3,
      true,
      [],
      [2],
      {},
      { digits: '2' },
      { digits: 2.5 },
      { digits: 2, extra: 1 },
      { other: 2 },
      JSON.parse('{"__proto__": {"digits": 2}}'),
    ]) {
      expect(combineToken(hostile)).toBe(UNREADABLE_COMBINE);
    }
  });
});

describe('what a pick authors', () => {
  const P = 'sections.body.items[0]';

  it('authors a keyword as itself', () => {
    expect(typesettingOp(P, 'writingMode', '', 'vertical_rl')).toEqual({
      op: 'putValue',
      path: P,
      keys: ['style', 'writingMode'],
      value: 'vertical_rl',
    });
    expect(typesettingOp(P, 'textCombineUpright', 'digits2', 'all')).toEqual({
      op: 'putValue',
      path: P,
      keys: ['style', 'textCombineUpright'],
      value: 'all',
    });
  });

  it('authors a digits token as the map', () => {
    expect(typesettingOp(P, 'textCombineUpright', 'none', 'digits3')).toEqual({
      op: 'putValue',
      path: P,
      keys: ['style', 'textCombineUpright'],
      value: { digits: 3 },
    });
  });

  it('keeps a digits-looking spelling verbatim on any other key', () => {
    expect(typesettingOp(P, 'lineBreak', '', 'digits2')).toMatchObject({ value: 'digits2' });
  });

  it('removes the key for not set', () => {
    expect(typesettingOp(P, 'lineBreak', 'strict', '')).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['style', 'lineBreak'],
    });
  });

  it('authors nothing for an unchanged pick', () => {
    expect(typesettingOp(P, 'lineBreak', 'strict', 'strict')).toBeNull();
    expect(typesettingOp(P, 'lineBreak', '', '')).toBeNull();
  });
});
