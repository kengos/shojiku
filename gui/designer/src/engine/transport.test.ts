import { describe, expect, it } from 'vitest';
import { TransportError } from './transport';

describe('TransportError', () => {
  it('is an Error carrying the transport name and message', () => {
    const error = new TransportError('nope');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('TransportError');
    expect(error.message).toBe('nope');
  });

  it('has no code or args when constructed without fields', () => {
    const error = new TransportError('nope');
    expect(error.code).toBeUndefined();
    expect(error.args).toBeUndefined();
  });

  it('carries a typed code and args when a host-misuse error is wrapped', () => {
    const error = new TransportError('page out of range', {
      code: 'page_out_of_range',
      args: { page: 9, total: 2 },
    });
    expect(error.code).toBe('page_out_of_range');
    expect(error.args).toEqual({ page: 9, total: 2 });
  });
});
