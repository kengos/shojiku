import { render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EngineTransport } from '../engine/transport';
import { EngineProvider, useEngineTransport } from './context';

const fakeTransport = {} as EngineTransport;

describe('EngineProvider / useEngineTransport', () => {
  it('provides the injected transport to consumers', () => {
    const { result } = renderHook(() => useEngineTransport(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <EngineProvider transport={fakeTransport}>{children}</EngineProvider>
      ),
    });
    expect(result.current).toBe(fakeTransport);
  });

  it('throws when used outside an EngineProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Probe = () => {
      useEngineTransport();
      return null;
    };
    expect(() => render(<Probe />)).toThrow(/EngineProvider/);
    spy.mockRestore();
  });
});
