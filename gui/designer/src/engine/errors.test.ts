import { describe, expect, it } from 'vitest';
import { errorText, throwFields } from './errors';

describe('errorText', () => {
  it('returns an Error message', () => {
    expect(errorText(new Error('boom'))).toBe('boom');
  });

  it('stringifies a non-Error thrown value', () => {
    expect(errorText('bare string')).toBe('bare string');
  });
});

/** A typed host-misuse throw, as the wasm shim builds it: an Error with a
 * `code` string and an `args` object of scalars. */
function typedThrow(code: unknown, args: unknown): Error {
  const error = new Error('page 9 is out of range');
  Object.assign(error, { code, args });
  return error;
}

describe('throwFields', () => {
  it('returns message-only for a bare string throw (older engine)', () => {
    expect(throwFields('boom')).toEqual({ message: 'boom' });
  });

  it('returns message-only for a null throw', () => {
    expect(throwFields(null)).toEqual({ message: 'null' });
  });

  it('extracts a string code and copies scalar args into a fresh object', () => {
    const fields = throwFields(typedThrow('page_out_of_range', { page: 9, total: 2 }));
    expect(fields.code).toBe('page_out_of_range');
    expect(fields.args).toEqual({ page: 9, total: 2 });
  });

  it('keeps only scalar arg values, dropping objects/arrays/functions/undefined/null', () => {
    const fields = throwFields(
      typedThrow('locale_error', {
        detail: 'bad',
        count: 3,
        flag: true,
        nested: {},
        list: [],
        fn: () => {},
        missing: undefined,
        empty: null,
      }),
    );
    expect(fields.args).toEqual({ detail: 'bad', count: 3, flag: true });
  });

  it('drops a non-string code but keeps valid args', () => {
    const fields = throwFields(typedThrow(42, { page: 1 }));
    expect(fields.code).toBeUndefined();
    expect(fields.args).toEqual({ page: 1 });
  });

  it('drops a non-object args (and a null args)', () => {
    expect(throwFields(typedThrow('bad_scale', 'oops')).args).toBeUndefined();
    expect(throwFields(typedThrow('bad_scale', null)).args).toBeUndefined();
  });

  it('does not retain the thrown object — args is a fresh copy', () => {
    const original = { page: 1 };
    const fields = throwFields(typedThrow('page_out_of_range', original));
    expect(fields.args).not.toBe(original);
  });
});
