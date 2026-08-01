# `eemeli/yaml` document-model traps (designer-core)

> AI-only. The document-model *rules* (patch ops, round-trip fidelity as
> the adoption gate) live in `shojiku-gui-professional`; this file is
> the library-behavior incident list.

## Alias bombs

- **`maxAliasCount` is a `toJS()`/materialization option, NOT a
  `parseDocument` option** (`tsc` rejects it on parse options). Parsing
  builds the CST holding aliases as nodes without expanding them, so
  parse is inherently bomb-safe; the "billion laughs" expansion — and
  the cap that stops it — happen only at materialization
  (`doc.toJS({ maxAliasCount })`). The alias-bomb TEST must call the
  materializer. **EVERY materialization call site is a bomb surface** —
  a review caught `node.toJSON()` inside a patch op (no cap parameter
  exists on it) reintroducing the bypass; to copy a subtree use
  `Node.clone()` (deep, aliases stay alias nodes), never a JS
  round-trip.

## Serialization fidelity

- **Document mode round-trips at canonical-CST fidelity, not
  byte-for-byte.** Comments and key order are preserved, but flow
  collections re-emit in canonical spacing (`[heading]` → `[ heading ]`)
  on the first write, even for untouched nodes. A byte-exact round-trip
  test must use a **fixed-point fixture** (run it through
  `parse`→`String(doc)` once and assert idempotence). At stringify the
  FLOW CONTEXT wins: a `flow: false` node nested inside a flow
  collection still emits as flow; only a block-context node's flag
  changes output.
- The default `toString()` **folds lines at 80 columns**; pin ONE
  serializer (`doc.toString({ lineWidth: 0 })`) as the app's only
  serialization home, and store bundled presets at that fixed point (a
  glob test asserting `serialize(parse(src)) === src` is the permanent
  gate).

## Map mutation

- `map.set(newKey, …)` **APPENDS** at the map's end — a "creates `page:`
  at the top" expectation is wrong; assert the new key at the tail.
- A key ADDED via `map.set('foo', …)` is stored as a **RAW STRING** on
  the `Pair`, not a `Scalar` — a pair-finding helper must match BOTH
  forms (`pair.key === key || (isScalar(pair.key) && pair.key.value ===
  key)`, what eemeli's internal `findPair` does).
- To rename a key in place replace the `Pair`'s KEY node
  (`pair.key = doc.createNode(to)`); never delete+set (that appends at
  the tail, losing position + comments). **The replacement key must COPY
  the old key node's furniture** — `commentBefore`/`comment`/
  `spaceBefore`/`anchor` (when `isScalar(old)`): a root-level entry's
  comment line lives on the KEY node and vanishes otherwise, and a
  dropped `anchor` (`&a key:` with a `*a` alias elsewhere) makes the
  NEXT `toString()` THROW "Unresolved alias" — a crash a
  hostile-but-valid document can trigger after a "successful" op. Test
  the rename against a ROOT-level commented key (nested fixtures attach
  comments elsewhere and pass without the copy) and an anchored+aliased
  key.
- **A VALUE set over a pair whose previous value was a COLLECTION is
  stored RAW too**: `map.set(key, 3)` mutates an existing SCALAR node in
  place, but when the old value was a seq/map the pair holds the plain
  JS value, not a node — so any reader built on `doc.getIn(path, true)`
  + an `isNode` guard silently reports the just-written leaf as MISSING.
  Readers must return non-node non-undefined leaves as-is. This hid
  until the first UI that legally replaces a collection with a scalar;
  only a read-after-write test over a collection-valued fixture catches
  it.
