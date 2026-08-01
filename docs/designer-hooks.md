# The ShojikuGui hook registry

The Designer's subscriber-style extension surface for **integrators who
build their own host bundle** (import `@shojiku/designer` and mount the
component, or rebuild the standalone app): your code — or an npm package
you depend on — registers contributions at import time, and the host's
boot collects them. The prebuilt mounted host
([designer-mount.md](designer-mount.md)) has no integrator JS and is not
affected by this surface.

```ts
import { ShojikuGui } from '@shojiku/designer';

ShojikuGui.hook('init:presets', (ctx) => {
  ctx.addPreset({
    id: 'acme-invoice',
    locales: ['ja'],
    engineLocale: 'ja-JP',
    name: { ja: 'ACME 請求書' },
    thumbnailUrl: 'https://cdn.acme.example/invoice-thumb.png',
    load: async () => acmeInvoiceFiles(), // template/params/definitions/assets/variants
  });
});
```

A preset package is ordinary imported code in **your** build
(npm-standard trust): Shojiku never depends on external packages, hosts
no registry of its own, and auto-discovers nothing — you import the
package, its import-time `hook()` calls land in the singleton, and the
app's boot picks them up.

## The event table (append-only)

Events are a CLOSED set; unknown names throw at `hook()` time. The table
only ever grows — the same governance as the engine's diagnostics code
registry: event names and payload keys are append-only, an event ships
only once a real consumer exists, and retirement goes through the
deprecation metadata below.

Naming scheme (decided once): `<stage-or-verb>[:<topic>]` — the first
segment is a lifecycle stage (`init`) or an operation verb (`load` /
`save` / `list`), the second the topic, **singular** for a one-document
operation (`save:template`) and **plural** for a collection one
(`list:projects`).

| Event | Kind | Payload |
| --- | --- | --- |
| `init:fonts` | notification | ctx `{ addSource(FontSource) }` — contribute a boot-scoped font source; sources are consulted in registration order, before the session's picked-font library |
| `init:presets` | notification | ctx `{ addPreset(PresetContribution) }` — contribute a catalog preset (shape above) |
| `load:template` | provider | `(key) => Promise<TemplateDoc \| null>` |
| `save:template` | provider | `(key, doc) => Promise<SaveOutcome>` |
| `list:projects` | provider | `() => Promise<readonly ProjectSummary[]>` |
| `load:project` | provider | `(id) => Promise<ProjectDetail>` |
| `save:definitions` | provider | `(projectId, doc) => Promise<SaveOutcome>` |
| `suggest:ops` | provider | `(request: CopilotRequest) => Promise<CopilotReply>` — the AI copilot's transport (see below) |

The provider events ARE the persistence seam: registering all four
template/project providers puts the app into mounted mode (project list
→ templates → editor) exactly as a `config.json` HTTP host does;
`save:definitions` additionally arms the data-item editor's save wire.
The interfaces (`TemplateStore`, `ProjectSource`, `DefinitionsStore`,
`TemplateDoc`, `SaveOutcome`, …) are exported by `@shojiku/designer`.

## The two hook kinds

- **Notification** (`init:*`): many subscribers, fire-and-forget, no
  return value — contributions ride the typed collecting context. Fired
  once per host boot, subscribers run in **registration order**, each
  awaited before the next (deterministic). A subscriber that throws or
  rejects is **isolated**: the error is reported (default
  `console.error`) and the remaining subscribers still run — one bad
  package cannot kill boot. The context **closes when the event
  settles**: stashing `ctx` and calling it later throws.
- **Provider**: a single request-response implementation per event —
  registering a second provider **throws at registration time**
  (fail-loud, deterministic), and `hook()` returns a dispose that frees
  the slot. Call-time errors propagate to the caller unchanged
  (fail-closed; the seam's typed `SaveOutcome` stays the provider's own
  contract — return `{ ok: false, kind: 'error' }`, don't throw, for
  ordinary failures).

Both kinds return a `Dispose` from `hook()`; disposing is idempotent.

## Contribution guards (defense in depth)

Contributions are your code, but their values flow into storage keys and
the DOM, so the collector re-guards them; an invalid contribution is
**dropped and reported**, never a crash:

- `id` must match the safe charset (`[A-Za-z0-9._-]`, ≤64 chars, no
  `.`/`..`) — it becomes a localStorage draft key and a document key.
- Duplicate ids are dropped **first-wins** — the host SEEDS its bundled
  catalog into the collector before the event fires, so a package can
  never shadow a bundled preset, regardless of import order.
- `thumbnailUrl` admits `http:`/`https:`, `data:image/*`, and relative
  paths only; other schemes, `//host` protocol-relative URLs, and any
  URL containing control characters or spaces are stripped — the card
  then renders without an image.

## The AI copilot provider (`suggest:ops`)

Registering `suggest:ops` arms the Designer's copilot UI (a toolbar
prompt modal); absent, the feature is hidden entirely. Your provider is
the TRANSPORT only — forward the request to your own LLM and resolve
with its reply; API keys live in your host, never in GUI code or
storage.

```ts
ShojikuGui.hook('suggest:ops', async (request) => {
  // request: { prompt, instructions, template, definitions?, selectionPath?, params? }
  const answer = await myLlm.complete({
    system: request.instructions, // the GUI-authored op-schema contract
    user: `${request.prompt}\n\n${request.template}`,
  });
  return { ops: JSON.parse(answer), note: 'optional short explanation' };
});
```

- `instructions` is the GUI-versioned op-schema contract
  (`COPILOT_INSTRUCTIONS`, exported by `@shojiku/designer`): ship it to
  the model so the reply matches the ops the validating GUI accepts.
- The reply's `ops` are treated as UNTRUSTED: the GUI refuses the whole
  reply on any invalid entry (op-name allowlist, 256-op cap), dry-runs
  the batch transactionally on a scratch editor, and shows the result
  as a diff in the review pane — nothing applies until the user
  confirms, and a confirmed proposal lands as ONE undo step.
- `note` (optional) renders as escaped text beside the diff,
  display-capped.
- Request fields are append-only (the payload governance above);
  tolerate new optional fields.

## Deprecation

An event-table entry carries `status: 'active' |
{ deprecated: { since, replacement, removedIn } }`. Registering on a
deprecated event warns **once per event** (default `console.warn`),
naming the replacement. Payload fields deprecate the same way; actual
removal only lands across a major version after a deprecation window.
Every v1 event is `active`.

## What the app itself routes through this surface (the proof)

The standalone app's own boot rides this composition
(`gui/designer-app/src/app/hookup.ts`): its assembled preset catalog
and bundled font source are **seeded** into the same guarded collectors
the `init:*` events fill (ahead of the events — import-time package
registrations run before the app's composition, so seeding is what
keeps bundled entries first), and the mounted host's HTTP stores
register through the five provider events — then one collection pass
derives the app's services. Delete a seed or a registration and the
corresponding feature disappears; an integrator registration joins the
very same collection.

The Designer **component** never reads the registry: it stays
props-driven, and the registry is a host-composition surface only.
