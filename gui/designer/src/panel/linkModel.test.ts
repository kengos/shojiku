import { describe, expect, it } from 'vitest';
import { linkUrlProblem, MAX_LINK_URL_BYTES, readLinkUrl, spliceAt } from './linkModel';

const read = (item: unknown) => () => item;

describe('readLinkUrl', () => {
  it('reports the authored url, and an empty string for no link', () => {
    expect(readLinkUrl(read({ type: 'text' }), 'p')).toBe('');
    expect(readLinkUrl(read({ type: 'text', link: { url: 'https://x.test' } }), 'p')).toBe(
      'https://x.test',
    );
  });

  it('reads a hostile `link` as no url, never throwing', () => {
    // Such a document does not render either way: `Link.url` is required, so
    // `link: {}` is a parse error rather than a link the panel is hiding.
    for (const link of ['https://x.test', ['a'], null, 7, {}, { url: 5 }]) {
      expect(readLinkUrl(read({ type: 'text', link }), 'p')).toBe('');
    }
  });

  it('degrades on an unreadable item', () => {
    const throws = () => {
      throw new Error('mid-edit');
    };
    expect(readLinkUrl(throws, 'p')).toBe('');
    expect(readLinkUrl(read('not a map'), 'p')).toBe('');
  });
});

describe('linkUrlProblem', () => {
  it('passes an INTERPOLATING url through, scheme or not', () => {
    // The corpus case: all ten bundled examples that author a link are this
    // shape, and none carries a scheme. The engine gates the RESOLVED value.
    for (const url of ['{web.invoice_url}', 'https://x.test/{order.code}', '{a}{b}']) {
      expect(linkUrlProblem(url)).toBeNull();
    }
  });

  it('accepts each allowed scheme, in any ASCII case', () => {
    for (const url of [
      'http://x.test',
      'https://x.test',
      'mailto:a@b.jp',
      'tel:+81-3-0000-0000',
      'HTTPS://X.TEST',
      'MailTo:a@b.jp',
      '  https://x.test  ',
    ]) {
      expect(linkUrlProblem(url), url).toBeNull();
    }
  });

  it('refuses a scheme outside the allowlist', () => {
    for (const url of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      '  javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,<script>',
      'example.com',
      '//x.test',
      'httpx://x.test',
    ]) {
      expect(linkUrlProblem(url), url).toBe('scheme');
    }
  });

  it('refuses a control character anywhere in the url', () => {
    // Written as ESCAPES, never as literal bytes: a raw control byte makes the
    // whole source file binary to a plain `grep`, so the case would silently
    // vanish from every sweep that goes looking for it. `char::is_control` in
    // Rust is the Unicode Cc category, which is U+0000-U+001F and U+007F-U+009F.
    expect(linkUrlProblem('java\u000Ascript:alert(1)')).toBe('scheme');
    expect(linkUrlProblem('https://x.test/\u0000')).toBe('scheme');
    expect(linkUrlProblem('https://x.test/\u007F')).toBe('scheme');
    expect(linkUrlProblem('https://x.test/\u009F')).toBe('scheme');
    expect(linkUrlProblem('https://x.test/a\u0009b')).toBe('scheme');
    // A SURROUNDING control character is trimmed away instead, exactly as
    // `check_link_url` trims before it tests — the case that separates the two
    // rules, and the one a wider guess would get wrong.
    expect(linkUrlProblem('\u0009https://x.test/\u000A')).toBeNull();
  });

  it('measures the cap in BYTES, not characters', () => {
    // The discriminating case. `'あ'` is three UTF-8 bytes, so this url is over
    // the cap in bytes and comfortably under it in CHARACTERS — a `.length`
    // implementation lets it straight through.
    const head = 'https://x.test/';
    const overBy = MAX_LINK_URL_BYTES - head.length + 3;
    expect(linkUrlProblem(head + 'あ'.repeat(Math.ceil(overBy / 3)))).toBe('tooLong');
    // Exactly at the cap is fine, and it is ASCII so both measures agree.
    expect(linkUrlProblem(head.padEnd(MAX_LINK_URL_BYTES, 'a'))).toBeNull();
    expect(linkUrlProblem(head.padEnd(MAX_LINK_URL_BYTES + 1, 'a'))).toBe('tooLong');
  });

  it('treats an empty or whitespace-only url as the CLEAR path, not a problem', () => {
    expect(linkUrlProblem('')).toBeNull();
    expect(linkUrlProblem('   ')).toBeNull();
  });

  it('does not choke on a very long paste', () => {
    // The byte count is one linear pass; this pins that nothing quadratic
    // crept in behind it.
    expect(linkUrlProblem(`https://x.test/${'a'.repeat(1_000_000)}`)).toBe('tooLong');
  });
});

describe('spliceAt', () => {
  it('inserts at the caret and reports where the caret lands after it', () => {
    expect(spliceAt('https://x/', 10, 10, '{k}')).toEqual({ value: 'https://x/{k}', caret: 13 });
    expect(spliceAt('ab', 0, 0, '{k}')).toEqual({ value: '{k}ab', caret: 3 });
  });

  it('replaces a selection', () => {
    expect(spliceAt('https://x/OLD', 10, 13, '{k}')).toEqual({
      value: 'https://x/{k}',
      caret: 13,
    });
  });

  it('clamps bounds — a caret can sit past the value it was taken against', () => {
    expect(spliceAt('ab', 99, 99, '{k}')).toEqual({ value: 'ab{k}', caret: 5 });
    expect(spliceAt('ab', -5, -5, '{k}')).toEqual({ value: '{k}ab', caret: 3 });
    // An inverted range collapses rather than producing a hole.
    expect(spliceAt('abcd', 3, 1, '{k}')).toEqual({ value: 'abc{k}d', caret: 6 });
  });

  it('treats a NULL bound as the start of the value', () => {
    // `HTMLInputElement.selectionStart` is `number | null` — null for the input
    // types that support no selection. Normalised here rather than at the call
    // site, so it is a case a test can reach.
    expect(spliceAt('ab', null, null, '{k}')).toEqual({ value: '{k}ab', caret: 3 });
    expect(spliceAt('ab', 1, null, '{k}')).toEqual({ value: 'a{k}b', caret: 4 });
  });
});
