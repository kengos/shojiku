# Mounting the Designer in your system

The Designer's third integration form (after the embeddable component
and the standalone site) is the **mounted host**: your system serves
the Designer's static build under its own reverse-proxy path
(`/admin/designer/`), your auth stack fronts it — a request is
authenticated before the app is even served — and persistence goes to
your server through a small JSON contract you implement. Shojiku ships
**zero auth code** and hosts nothing.

```text
Browser ──(your session cookie)──▶ your reverse proxy
   ├─ /admin/designer/…        → the Designer's static files
   ├─ /admin/designer/config.json → { persistence: { kind: "http", base: "api/" } }
   └─ /admin/designer/api/…    → your app (the JSON contract below)
```

The same static build serves both forms: at boot the app fetches
`config.json` beside its `index.html`. Absent (404) or invalid → the
standalone preset catalog (the shipped build carries an explicit `{}`,
which reads as standalone without the 404). Present and valid → the app
opens into your **project list** and saves through your API.

## The mount, step by step

1. **Build the static assets.** The self-contained serving image builds
   everything (wasm → app → assembled data) and serves it with nginx:

   ```sh
   docker build -f gui/designer-app/Dockerfile -t shojiku-designer-app:local .
   ```

   (Any other way of producing `gui/designer-app/dist` works the same —
   the image is a convenience. Asset URLs are relative, so the build
   serves at any path depth.)

2. **Add `config.json`.** Replace the shipped `{}` beside `index.html`:

   ```json
   { "persistence": { "kind": "http", "base": "api/" } }
   ```

   `base` is resolved against the app's own URL and must stay on the
   same origin (an absolute same-origin URL or an absolute path also
   work; anything cross-origin is ignored and the app runs standalone).
   With the image, mount it over the served root:

   ```yaml
   # docker-compose.yml (fragment)
   services:
     designer:
       image: shojiku-designer-app:local
       volumes:
         - ./designer-config.json:/usr/share/nginx/html/config.json:ro
   ```

3. **Mount both under your proxy.** The app must be served with a
   trailing-slash path (its asset URLs are relative); `api/` goes to
   your application:

   ```nginx
   location = /admin/designer { return 301 /admin/designer/; }

   location /admin/designer/api/ {
     # your auth, then your app — the contract below
     proxy_pass http://your-app:3000/shojiku/;
   }

   location /admin/designer/ {
     # your auth here too (auth_request, an upstream gateway, …)
     proxy_pass http://designer:80/;
   }
   ```

4. **Implement the contract** (below) in your application. Auth rides
   your session: the app fetches with `credentials: 'same-origin'` and
   never composes or stores a credential — whatever cookie/header your
   proxy layer needs is yours to enforce.

## The persistence contract

Five endpoints under the configured `base`. All bodies are JSON. The
stored unit is a **project**: an engineer-registered `definitions.yml`
(now also editable from the Designer's data-item editor) plus its
PM-edited templates.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `projects` | list projects |
| GET | `projects/{projectId}` | one project: definitions + template index |
| GET | `projects/{projectId}/templates/{templateId}` | one template document |
| PUT | `projects/{projectId}/templates/{templateId}` | save a template document |
| PUT | `projects/{projectId}/definitions` | save the project's definitions |

### Shapes

`GET projects` →

```json
{ "projects": [ { "id": "invoices", "name": "請求書" } ] }
```

`GET projects/{projectId}` →

```json
{
  "id": "invoices",
  "name": "請求書",
  "definitions": "type: object\nproperties: …",
  "templates": [
    { "id": "monthly", "name": "月次請求書", "engineLocale": "ja-JP" }
  ]
}
```

- `definitions` (optional): the project's `definitions.yml` text, in the
  OpenAPI-schema shape (`type: object` + `properties` — see
  [engine/definitions.md](engine/definitions.md)). Feeds the Field
  Palette and validation (including params-vs-schema checks), and is
  editable in the Designer's data-item editor — edits save through
  `PUT projects/{projectId}/definitions` below. The retired v1 `groups:`
  form is a parse-error diagnostic and hides the palette — migrate
  stored files server-side.
- `definitionsRev` (optional): your opaque revision token for the
  definitions document, echoed back on a definitions save (same
  optimistic-concurrency posture as a template's `rev`).
- `engineLocale` (optional, default `en-US`): which engine locale the
  editor boots for this template — it picks the font packs and locale
  data (`ja-JP`, `zh-TW`, …, from the app's own bundled data).

`GET …/templates/{templateId}` →

```json
{
  "source": "version: \"0.1.0\"\nsections: …",
  "params": "{ \"total\": 5000 }",
  "fonts": [],
  "rev": "20260717T093000-abc"
}
```

- `source`: the `templates.yml` text — the document being edited.
- `params` (optional): sample params JSON for preview.
- `fonts` (optional): the picked-font pins previously saved (see below);
  return what the last save sent.
- `rev` (optional): your opaque revision token, echoed back on save.

`PUT …/templates/{templateId}` request body:

```json
{ "source": "…the edited templates.yml…", "fonts": [], "rev": "…", "name": "…" }
```

- `name` (optional, present only when the PM renamed the document in the
  header): the new display name (≤ 120 chars). It is document metadata,
  not part of `templates.yml`. Honouring it is optional — store it and
  return it as the template entry's `name` in `GET projects/{projectId}`
  if you want the rename to stick in the template list; ignore it for
  last-write-wins on the host-side name. The Designer never reads a name
  back from `GET …/templates/{templateId}` (that response has no `name`
  field); the project index entry's `name` is the authoritative display
  source on reopen, and the editor re-fetches the project on back so an
  honoured rename shows fresh.

Responses:

- `200` with `{ "rev": "…next token…" }` (or an empty body) — saved.
- `409` — the document changed since `rev` was issued; the Designer
  shows a localized conflict message and keeps the user's local
  working copy. Only send 409 if you check `rev`; ignoring it entirely
  (last-write-wins) is a valid, simpler posture.
- anything else — the Designer shows a generic save error.

`PUT projects/{projectId}/definitions` request body:

```json
{ "definitions": "…the edited definitions.yml…", "rev": "…" }
```

The Designer sends this on an explicit save when the PM edited the
data-item definitions (labels, types, formats, descriptions, added
fields) — AFTER the template save succeeded, and only when something
actually changed. `rev` is the `definitionsRev` from
`GET projects/{projectId}` when you issued one. Responses follow the
template-save shape: `200` with an optional next `{ "rev": … }`, `409`
for a concurrency conflict (the Designer keeps the working copy and
shows the conflict message), anything else a generic save error — a
host that does not implement the endpoint (404) surfaces that error,
and the PM's edits stay in the local working copy. The definitions
document is PROJECT-scoped: a save from one template's editor changes
what every template in the project validates against — the data-item
editor surfaces this impact scope (an in-editor hint) whenever the
definitions save goes to a host, so the PM sees it before saving.

### The `fonts` entries

When a PM picks a Google-Fonts catalog font, the save payload carries
the pick as pinned metadata (never font bytes):

```json
{
  "packId": "gf-lato",
  "familyId": "gf-lato",
  "displayName": "Lato",
  "manifest": "…pack manifest.yml text with per-face url+sha256 pins…",
  "licenseFile": "OFL.txt",
  "licenseText": "…verbatim licence text…"
}
```

Store the array verbatim and return it on load; the app re-fetches the
font bytes through each manifest's pinned URL and verifies the sha256.
Rendering the saved template outside the Designer works the same way —
the manifest is a normal shojiku font pack (see the CLI's pinned-face
auto-fetch).

### Validation the client enforces

The app treats every response as untrusted input. Stay inside these or
the response is rejected (the user sees a load/save failure):

- `id` values (projects, templates, `engineLocale`): charset
  `[A-Za-z0-9._-]`, one path segment, ≤ 64 chars.
- `name` values: any string; display is clipped to 120 chars.
- Lists (`projects`, `templates`, `fonts`): ≤ 256 entries.
- Any single response body: ≤ 4 MiB.

### Concurrency

Default is last-write-wins: ignore `rev`, always answer `200`. For
optimistic concurrency, issue a new `rev` on every save, compare the
one the client echoes, and answer `409` on mismatch. The Designer also
autosaves a local working copy (browser localStorage) as crash
recovery; a successful server save clears it.

## v1 boundaries

- **Definitions edits are metadata + added fields only**: the Designer
  never renames a field KEY or deletes a field (both fan out into
  template bindings and params). Structural rewrites stay server-side.
- **Sample params stay engineer-owned**: read-only in the mounted
  Designer, never part of any save payload.
- **No template create/delete** from the Designer; manage the template
  index in your system.
- **No per-project asset endpoint yet**: a template referencing bundled
  images (`assets/<name>`) previews with a missing-image diagnostic in
  the mounted editor.
