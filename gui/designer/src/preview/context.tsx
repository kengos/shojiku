// The engine host-injection point: the transport is provided via context so the
// standalone app, an embedding host, or a test each supplies its own (browser
// WASM today; a Worker/server transport later) without the component reaching
// around to an app concern.

import { createContext, type ReactNode, useContext } from 'react';
import type { EngineTransport } from '../engine/transport';

const TransportContext = createContext<EngineTransport | null>(null);

export interface EngineProviderProps {
  readonly transport: EngineTransport;
  readonly children: ReactNode;
}

export function EngineProvider({ transport, children }: EngineProviderProps) {
  return <TransportContext.Provider value={transport}>{children}</TransportContext.Provider>;
}

/** Read the injected transport. Throws when used outside an `<EngineProvider>`
 * (a wiring bug, not a document error). */
export function useEngineTransport(): EngineTransport {
  const transport = useContext(TransportContext);
  if (transport === null) {
    throw new Error('useEngineTransport must be used within an <EngineProvider>');
  }
  return transport;
}
