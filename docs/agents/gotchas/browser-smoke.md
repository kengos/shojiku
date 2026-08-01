# Live-browser smoke traps (dev server / Browser pane) — `gui/`

> AI-only. When a smoke is warranted is `shojiku-gui-check` /
> `shojiku-node-professional`; this file is how the smoke itself goes
> wrong. Docker mount/cwd traps: [docker-make.md](docker-make.md).

## Serving the app

- **`make gui-dev`/`gui-serve` pass `-it` to docker and die with "stdin
  is not a terminal" from a non-interactive shell.** Run the target's
  `docker run` line directly WITHOUT `-it` (copy it from the Makefile),
  backgrounded; stop via
  `docker ps -q --filter ancestor=<image> | xargs docker stop`.
- **A re-run of `make gui-serve` does NOT replace the running
  container**: the old one keeps port 8788, the new run dies with a
  port conflict — and the browser keeps being served the STALE dist, so
  a just-built fix looks absent. Treat "my change isn't in the page" as
  a stale-server symptom before a code one. **Port 5173 may already be
  held by an earlier session's container** — a `curl` health check then
  "succeeds" against that OTHER server. Publish a different port
  (`-p 5174:5174` + `vite --port 5174`) rather than stopping a container
  you did not start. **`preview_stop` on the launch.json Docker dev
  server is one source of those leftovers**: it ends the wrapper
  process, not the `docker run` container, which survives holding the
  port — the next session's `preview_start` then fails "port in use by
  com.docker.backend". When the leftover is YOUR OWN cycle's
  (`docker ps`: the `node:*-slim` image publishing 5173), `docker stop`
  it and restart; the different-port escape stays for containers you
  did not start.
- **An already-running dockerized Vite server can serve a STALE
  transform of a file you just edited** (macOS volume-mount watch
  misses; `touch` does not invalidate). Before smoking against a
  pre-existing server, grep a NEW symbol in the served module
  (`curl localhost:5173/@fs/repo/<path> | grep <symbol>`) FIRST. If
  absent and the server is yours, `docker restart` it; a
  `window.location.reload()` does NOT help (Vite re-serves the cached
  transform until its dead watcher invalidates it) — only a fresh server
  or a cache-busted URL (`?t=<now>`).
- **`rm -rf gui/*/coverage` after a `make gui` run before smoking** —
  the lcov-report churn floods the watcher with thousands of reload
  events. The symptom reads exactly like a crash: black screen, `#root`
  empty, NO console error (the page reloads faster than the app boots).
  Check `preview_logs` for a wall of `[vite] (client) page reload
  coverage/lcov-report/...` before debugging your change; fix = the
  `rm -rf` plus a `docker restart`.
- **Smoking a served/mounted app variant doesn't need the full serving
  image**: build the real dist in the Node image, then serve `dist/`
  with a throwaway script stubbing the contract the variant needs (the
  mounted-host smoke = one python `http.server` subclass serving
  `/admin/designer/` + the JSON contract). Minutes instead of the
  multi-stage wasm image build.
- **A feature gated on a host-injected prop the standalone app never
  passes has no reachable armed state in the shipped app** — and
  registering the provider from the console cannot help (the boot
  composition already ran). Smoke with a SCRATCH Vite entry: an
  `.html` + `.tsx` pair in `designer-app` mounting the `Designer` over a
  STUB transport + stub provider — no wasm, boots in seconds. Scratch
  files are session artifacts: delete before commit.
- **A dev-only Vite entry with no engine boot (e.g. the UI catalog at
  `/catalog.html`) needs neither wasm nor `assemble`**: run
  `pnpm --filter @shojiku/designer-app exec vite --host 0.0.0.0 --port
  5173` directly (backgrounded, no `-it`).

## Driving the Browser pane

- **Open a localhost server with `preview_start {url}`, never a plain
  `navigate`** — a bare navigate to a localhost origin is policy-blocked;
  `preview_start` reaches it and returns the `tabId`. Once open, a
  same-origin `navigate` (to reset scroll) works.
- Click by `ref` from `read_page` — raw screenshot coordinates are in
  screenshot space, not viewport space. **The canvas overlay's SVG rects
  never appear in `read_page`'s interactive tree (no ref to click), and
  `computer` coordinate clicks on them are unreliable even from a
  fronted pane with a fresh screenshot** — select an overlay box by
  JS-dispatching `pointerdown`/`pointerup`/`click` `PointerEvent`s on
  the rect (client coords from its own `getBoundingClientRect`), then
  read the panel in a SECOND exec (the React flush is async; the same
  exec always reads the pre-click DOM). That drives click-to-SELECT
  only — a pointer-capture DRAG machine still ignores synthetic events
  (below). The pane's synthetic
  `double_click` does NOT open the canvas overlay's dblclick-to-edit —
  smoke the editor through the layer tree + property panel and leave
  overlay-open coverage to the jsdom tests.
- **A HIDDEN Browser pane composits no frames, and rAF-driven
  transitions stall in BOTH directions**: "dialog never opens" AND
  "dialog never closes" (a closed modal's node stays in the DOM
  mid-exit — one "zombie dialog" burned ~8 probe rounds that a single
  screenshot disproved). The stall also FREEZES `getComputedStyle` on
  any element with a `transition-*` utility at the INTERPOLATED value
  (a theme-switch probe read a ~50% blend of the two themes and stayed
  there — reads exactly like a real contrast defect; the tell: a
  non-transitioning sibling reports final values). **Screenshot FIRST**
  (fronting the pane resumes compositing), then probe. The same stall
  shows up ON the screenshot as a mid-transition frame: a freshly
  opened modal captured translucent, the page bleeding through a panel
  whose computed `bg-surface` is opaque — RETAKE the screenshot before
  diagnosing a theming defect; the second frame is final.
- **A hidden pane also makes the non-visual tools time out, 30s each**
  (`javascript_tool`/`form_input` report "may be stuck"), and
  `tabs_select` does NOT clear it. A `screenshot` usually does; when
  even that fails, **`read_page` still works while hidden** and confirms
  the page is alive. The pane tends to go hidden right after a
  `left_click_drag` — expect it and lead with the screenshot.
- **A canvas DRAG uses the REPORTED "Screenshot size"** (e.g. 800×450)
  as the coordinate space, not the rendered image's pixel size (often
  2×) — out-of-bounds coordinates silently no-op the gesture.
  **Synthetic `PointerEvent`s via `javascript_tool` do NOT drive a
  pointer-capture drag machine in the live browser** (even shipped,
  known-good drag paths ignore them — don't debug the feature): use the
  pane's real `left_click_drag`, converting CSS-pixel rects to the
  screenshot space (CSS × reported-width ÷ `innerWidth`).
- On a dev-only page `read_page` can return an empty `0x0` tree and
  coordinate clicks merely scroll — drive state with `javascript_tool`:
  query the real button and `.click()` it. A React state change from
  that click is ASYNC — read `getComputedStyle` in a SECOND exec after
  the flush. The JS-exec context PERSISTS top-level `const` across calls
  — wrap each probe in an IIFE.
- **To commit a value into a commit-on-BLUR field via JS, dispatch
  `focusout`, not `blur`**: React 18 delegates `onBlur` to a bubbling
  `focusout` listener, so a non-bubbling `blur` never fires it. Set the
  value with the native setter
  (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v)`),
  then `el.dispatchEvent(new FocusEvent('focusout',{bubbles:true}))`. A
  round-trip smoke that "saved but nothing persisted" is usually this,
  not a product bug.
- **To smoke an app STATE no bundled preset can reach** (a `cell:`
  column, any hand-crafted document), inject it through the app's OWN
  draft-restore path — write the versioned draft envelope (see
  `persistence/draftEnvelope.ts` for the current fields, and
  `persistence/drafts.ts` for the storage key) into its localStorage
  key, reload, click 復元 — rather than hunting a UI path that can
  author it.

## Engine/wasm staleness (the "my feature is absent" family)

- **The dev server serves an ASSEMBLED COPY of `engine/wasm/pkg`, taken
  once at startup** — a `make wasm` rebuild does NOT reach a running dev
  server. A capability-gated feature then appears ABSENT for a reason
  that looks exactly like a broken gate. Re-run `assemble` (or restart
  the dev server) after every `make wasm`; treat "the served
  `shojiku_wasm.js` contains the new export" as the precondition for
  judging the feature.
- **An engine-side wire change invalidates the built wasm pkg** — the
  integration suites dynamic-import it, so a stale build fails the WHOLE
  wasm suite with misleading parse errors that look like GUI
  regressions. Re-run `make wasm` after every engine edit batch — and at
  the START of a GUI-only cycle consuming a capability a previous cycle
  shipped (the pkg is gitignored; one cycle found its pkg four minutes
  older than the wire it needed). Prove it:
  `grep -ac <new wire spelling> engine/wasm/pkg/shojiku_wasm_bg.wasm` —
  **`-a` is load-bearing** (plain grep on a binary reads exactly like a
  genuine absence).
