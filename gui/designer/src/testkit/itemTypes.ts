// The engine's 15 wire item types, as a literal a jsdom suite can import (a
// jsdom environment cannot read the engine source the way `engineWire.ts`
// does). NOT a second source of truth: `ids/idWire.test.ts` asserts this list
// equals the `Item` enum's variants, so it cannot drift from the wire.
//
// Suite substrate, not product code (coverage-excluded like the rest of
// `testkit/`).

export const WIRE_ITEM_TYPES: readonly string[] = [
  'text',
  'rect',
  'line',
  'table',
  'page_number',
  'image',
  'container',
  'repeat',
  'repeat_flow',
  'qr_code',
  'list',
  'page_break',
  'char_grid',
  'ellipse',
  'checkbox',
];
