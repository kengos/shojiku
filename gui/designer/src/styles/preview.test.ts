import { describe, expect, it } from 'vitest';
import { stylePreview } from './preview';

describe('stylePreview', () => {
  it('emits nothing for an all-unset style', () => {
    expect(stylePreview({})).toEqual({});
  });

  it('maps each typographic prop that is set', () => {
    expect(
      stylePreview({
        fontSize: '16',
        fontFamily: 'Noto Serif',
        fontWeight: 'bold',
        fontStyle: 'italic',
        textAlign: 'center',
        color: '#444444',
        backgroundColor: '#eeeeee',
      }),
    ).toEqual({
      fontSize: '16px',
      fontFamily: 'Noto Serif',
      fontWeight: 'bold',
      fontStyle: 'italic',
      textAlign: 'center',
      color: '#444444',
      backgroundColor: '#eeeeee',
    });
  });

  describe('fontSize parse + clamp', () => {
    it('keeps an in-range integer', () => {
      expect(stylePreview({ fontSize: '20' }).fontSize).toBe('20px');
    });
    it('keeps an in-range decimal', () => {
      expect(stylePreview({ fontSize: '10.5' }).fontSize).toBe('10.5px');
    });
    it('accepts a pt suffix', () => {
      expect(stylePreview({ fontSize: '24pt' }).fontSize).toBe('24px');
    });
    it('accepts a px suffix', () => {
      expect(stylePreview({ fontSize: '13px' }).fontSize).toBe('13px');
    });
    it('trims surrounding whitespace', () => {
      expect(stylePreview({ fontSize: '  18  ' }).fontSize).toBe('18px');
    });
    it('clamps above the max down to the display ceiling', () => {
      expect(stylePreview({ fontSize: '40' }).fontSize).toBe('24px');
    });
    it('clamps below the min up to the display floor', () => {
      expect(stylePreview({ fontSize: '5' }).fontSize).toBe('9px');
    });
    it('drops a zero size', () => {
      expect(stylePreview({ fontSize: '0' }).fontSize).toBeUndefined();
    });
    it('drops a relative em unit (unresolvable in chrome)', () => {
      expect(stylePreview({ fontSize: '1.5em' }).fontSize).toBeUndefined();
    });
    it('drops a percentage', () => {
      expect(stylePreview({ fontSize: '120%' }).fontSize).toBeUndefined();
    });
    it('drops a non-numeric value', () => {
      expect(stylePreview({ fontSize: 'abc' }).fontSize).toBeUndefined();
    });
    it('drops a negative value', () => {
      expect(stylePreview({ fontSize: '-8' }).fontSize).toBeUndefined();
    });
    it('drops an exponent form (never reaches the DOM)', () => {
      expect(stylePreview({ fontSize: '1e999' }).fontSize).toBeUndefined();
    });
    it('drops a CSS-injection string rather than assign it verbatim', () => {
      expect(stylePreview({ fontSize: '1px;}html{}' }).fontSize).toBeUndefined();
    });
  });

  describe('enum props', () => {
    it('emits fontWeight only for bold', () => {
      expect(stylePreview({ fontWeight: 'bold' }).fontWeight).toBe('bold');
      expect(stylePreview({ fontWeight: 'normal' }).fontWeight).toBeUndefined();
      expect(stylePreview({ fontWeight: '700' }).fontWeight).toBeUndefined();
    });
    it('emits fontStyle only for italic', () => {
      expect(stylePreview({ fontStyle: 'italic' }).fontStyle).toBe('italic');
      expect(stylePreview({ fontStyle: 'normal' }).fontStyle).toBeUndefined();
    });
    it('emits textAlign only for a known alignment', () => {
      expect(stylePreview({ textAlign: 'left' }).textAlign).toBe('left');
      expect(stylePreview({ textAlign: 'right' }).textAlign).toBe('right');
      expect(stylePreview({ textAlign: 'justify' }).textAlign).toBeUndefined();
    });
  });

  describe('passthrough props (CSSOM is the safety boundary)', () => {
    it('omits empty color / family / background', () => {
      const css = stylePreview({ fontFamily: '', color: '', backgroundColor: '' });
      expect(css.fontFamily).toBeUndefined();
      expect(css.color).toBeUndefined();
      expect(css.backgroundColor).toBeUndefined();
    });
    it('sets a hostile color string as a single object prop (browser ignores it)', () => {
      // The value is not sanitized here — passing it as a keyed style object
      // prop is the defense: the CSSOM rejects the malformed declaration, so no
      // CSS-string breakout is possible.
      expect(stylePreview({ color: 'red;background:url(x)' }).color).toBe('red;background:url(x)');
    });
    it('sets a hostile fontFamily string as a single object prop', () => {
      expect(stylePreview({ fontFamily: 'x;} body{display:none' }).fontFamily).toBe(
        'x;} body{display:none',
      );
    });
    it('sets a hostile backgroundColor string as a single object prop', () => {
      expect(stylePreview({ backgroundColor: 'x;} body{color:red' }).backgroundColor).toBe(
        'x;} body{color:red',
      );
    });
  });
});
