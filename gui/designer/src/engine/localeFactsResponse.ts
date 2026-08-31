// The locale-facts response guard: what the engine's `localeFacts` JSON has to
// look like before the panel repeats it to a reader.
//
// A TS type is compile-time only, and these strings are shown as a statement
// of fact about the document ("dates print as …"). A wrong SHAPE must
// therefore become a `TransportError` here — the panel then explains nothing,
// which is the honest degradation — rather than reaching the page as
// `undefined`.

import type { LocaleFacts } from './types';
import { asRecord, asString, parseJson } from './wasmResponse';

/** Reads the engine's locale-facts JSON. */
export function toLocaleFacts(source: string): LocaleFacts {
  const root = asRecord(parseJson(source, 'locale facts'), 'locale facts');
  return {
    id: asString(root.id, 'locale facts.id'),
    date: asString(root.date, 'locale facts.date'),
    number: asString(root.number, 'locale facts.number'),
    currencyDefault: asString(root.currencyDefault, 'locale facts.currencyDefault'),
    amount: asString(root.amount, 'locale facts.amount'),
  };
}
