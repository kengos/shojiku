---
reference:
  group: concept
  order: 3
  keys: [fonts]
  summary: "Locale packs and font packs: where formatting data and typefaces come from."
---

# Locales & fonts (packs)

Formatting (dates, numbers, currency, era tables) and fonts come from
two places, split by how they scale:

- **Builtin locale data** — `ja-JP` and `en-US` chrome (CLDR-generated)
  is compiled into the engine; `--lang ja-JP` needs no locale file. A
  `packs/locale/<id>.yml` file is an **overlay** deep-merged over the
  builtin per key (mappings merge recursively, scalars/sequences
  replace), or the whole pack for a locale with no builtin. It
  **references font packs by id**. Cheap, per-country.
- `packs/fonts/<pack>/` — a fonts-only pack: `manifest.yml` + font files,
  shared across locales (one Latin pack serves many locales). Per script.

Templates stay locale-independent; the locale data supplies the defaults
at render time.

## Which locale is used

Resolution order (first match wins):

1. `--lang <id>` on the CLI (e.g. `--lang en-US`)
2. `locale:` in `definitions.yml`
3. `ja-JP` (the engine default)

Builtin matching is case-insensitive and a bare language tag selects its
unique builtin (`--lang ja` → `ja-JP`). For overlays and non-builtin
locales the id is lowercased to a filename (`ja-JP` → `ja-jp.yml`),
looked up across the **locale search dirs**. An id that is neither a
builtin nor a file errors, listing the builtin ids and searched dirs;
`shojiku capabilities` reports the builtin list as `builtinLocales`.

## Where packs are found

Both fonts and locales use an **additive search list**, highest priority
first — later entries add to (never replace) earlier ones, so a
`--font-dir` shadows the bundled packs on a matching face id:

| Kind | Search order |
| --- | --- |
| Locale files | `--locale-dir` (repeatable) → `$SHOJIKU_LOCALE_DIR` → `./packs/locale` |
| Font packs | `--font-dir` (repeatable) → `$SHOJIKU_FONT_DIR` → `./packs/fonts` |

An unset flag simply contributes nothing. The Docker image bakes
`$SHOJIKU_FONT_DIR` / `$SHOJIKU_LOCALE_DIR`.

## Builtin locales

Regenerated from CLDR by `scripts/gen-locale-builtins.py` into
`engine/formatter/src/lang/builtin/` (checked in; the render path stays
network-free):

| Locale | Notes |
| --- | --- |
| `ja-JP` | The default. `uses: [biz-ud, ipamj-mincho, noto-sans-mono]`, `¥`/JPY currency, `yyyy/MM/dd(E)`-style date patterns, weekday short names, the modern era table (Meiji through Reiwa) + `wareki` date/datetime variants. |
| `en-US` | `uses: [noto-sans, noto-sans-mono]`, USD default, `MM/dd/yyyy`-style patterns. |

### Shipped locale packs (`packs/locale/`)

Every other locale is a **pack file**, not engine data — generated from
the same script's `PACK_CONFIG` into `packs/locale/<id>.yml` and found
via `--locale-dir` / `$SHOJIKU_LOCALE_DIR` (default `./packs/locale`),
or injected as a string by a WASM host. Adding one needs no engine
change.

| Locale | Notes |
| --- | --- |
| `zh-TW` | `uses: [noto-sans-tc, noto-sans-mono]`, TWD default (CLDR `$` — the local dollar), `y年M月d日` patterns, weekday short names. |
| `zh-CN` | `uses: [noto-sans-sc, noto-sans-mono]`, CNY default (`¥`), `y年M月d日` patterns, weekday short names. |
| `hi-IN` | `uses: [noto-sans-devanagari, noto-sans, noto-sans-mono]`, `fallback: [noto-sans]` for Latin, INR default (`₹`), `d MMM y` patterns. Groups digits in 3s, not lakh/crore — see [features.md](features.md) § Locale data. |
| `fil-PH` | `uses: [noto-sans, noto-sans-mono]` (Latin script — no font of its own), PHP default (`₱`), `MMM d, y` patterns. |
| `th-TH` | `uses: [noto-sans-thai, noto-sans, noto-sans-mono]`, `fallback: [noto-sans]` for Latin, THB default (`฿`), `d MMM y` patterns. Dates carry the **Buddhist era**: the pack declares one open-ended era, so `y` renders 2026 CE as 2569 BE and `yyyy` stays Gregorian (the `gregorian` variant). Thai also wraps at word boundaries — see [text.md](text.md) § Wrapping & line breaking. |

## Font packs & `fontFamily`

`style.fontFamily` selects a **font family** by its global id; unset uses
the locale's `fonts.default`. Families/face ids are a **flat global
namespace** — a pack is just physical grouping, so the same id resolves
however the packs are laid out. The bundled packs provide:

| `fontFamily` | Pack (license) | Notes |
| --- | --- | --- |
| `biz-udp-gothic` | `biz-ud` (OFL-1.1) | **the ja default**; proportional kana; real bold |
| `biz-ud-gothic` | `biz-ud` (OFL-1.1) | fixed-pitch (aligned digits, full-width kana); real bold |
| `ipamj-mincho` | `ipamj-mincho` (IPA-1.0) | fallback-only mincho, MJ set (~55k glyphs) for the rare-name tail (e.g. `𠮷`); bold/italic synthetic |
| `noto-sans` | `noto-sans` (OFL-1.1) | **the en-US default**; real bold / italic / bold-italic (no synthetic slant); also the fil-PH default and the hi-IN / th-TH Latin fallback |
| `noto-sans-mono` | `noto-sans-mono` (OFL-1.1) | monospace for code/technical text (every bundled locale); real bold; CJK via the locale fallback chain |
| `noto-sans-tc` | `noto-sans-tc` (OFL-1.1) | **the zh-TW default**; Traditional Chinese + its own Latin; real bold; OTF/CFF outlines |
| `noto-sans-sc` | `noto-sans-sc` (OFL-1.1) | **the zh-CN default**; Simplified Chinese + its own Latin; real bold; OTF/CFF outlines |
| `noto-sans-devanagari` | `noto-sans-devanagari` (OFL-1.1) | **the hi-IN default**; Devanagari only (Latin comes from the `noto-sans` fallback); real bold |
| `noto-sans-thai` | `noto-sans-thai` (OFL-1.1) | **the th-TH default**; Thai only (Latin comes from the `noto-sans` fallback); real bold |

Each pack ships its license text (`OFL.txt` /
`IPA_Font_License_Agreement_v1.0.txt`) beside the fonts. An unknown
family warns `unknown_font_family` (once per family) and falls back to
the locale default face.

### A locale's font policy

The locale's `fonts:` block references packs and names its default /
fallback faces (all by global id):

```yaml
fonts:
  uses: [biz-ud, ipamj-mincho, noto-sans-mono]  # packs to load (packs/fonts/<id>/)
  default: biz-udp-gothic       # face id used when fontFamily is unset
  fallback: [ipamj-mincho]      # fallback chain, tried in order for missing glyphs
```

A `uses:` entry names a **directory** under a font search dir, so it must
be a plain single path segment: letters, digits, `-` and `_`, 1–64
characters. Anything else — a `/`, a `..`, an absolute path — fails the
locale pack's parse rather than being looked up.

### A font pack's manifest

`packs/fonts/<pack>/manifest.yml` declares the faces plus one license and
per-face integrity:

```yaml
version: 1
license: OFL-1.1
redistributable: true
faces:
  - id: noto-sans          # family defaults to the id
    file: NotoSans-Regular.ttf
    sha256: 478c558e…       # verified against the file bytes at load
  - id: noto-sans-bold
    file: NotoSans-Bold.ttf
    sha256: 1df075a3…
    family: noto-sans       # same family, different weight
    weight: bold            # normal | bold  (default normal)
  - id: noto-sans-italic
    file: NotoSans-Italic.ttf
    sha256: 467e3f89…
    family: noto-sans
    style: italic           # normal | italic (default normal)
```

At load each file's **sha256 is verified** (a mismatch from
tamper/corruption fails the load) and its OS/2 **`fsType` embedding
rights** are checked — a restricted face is rejected (`font_embedding_restricted`)
unless the manifest sets `embeddingAttested: true`. One license per pack:
mixed-license fonts split into separate packs (so IPAmj Mincho is its own
`ipamj-mincho` pack, not part of `biz-ud`).

A `file:` stays **inside the pack directory**. It may be neither absolute
nor `..`-climbing, and once symlinks are followed the file it resolves to
must still be under the pack — a link pointing out of the pack is refused,
one pointing within it is fine. The pack directory itself may not be a
symlink. A `file:` that is merely *absent* is not an error: that is the
pinned-reference case below.

### Adding your own font (`shojiku font add`)

A font you hold a licence for becomes an ordinary pack — no different
from a bundled one — with one command per face:

```bash
shojiku font add MyCorporate-Regular.ttf --family my-corporate --license Proprietary
```

That creates `packs/fonts/my-corporate/`, copies the file in, and writes
the `manifest.yml` with the file's sha256 already pinned. Run it again
with the same `--pack` to add another face to the same family:

```bash
shojiku font add MyCorporate-Bold.ttf --family my-corporate --license Proprietary \
  --weight bold
```

| Flag | Effect |
| --- | --- |
| `--family <id>` | *(required)* what `style.fontFamily` names. |
| `--license <id>` | *(required)* one licence for the whole pack. |
| `--pack <id>` | Pack directory name. Default: the family id. |
| `--face-id <id>` | Default: the family id plus `-bold` / `-italic` / `-bold-italic`. |
| `--weight normal\|bold`, `--style normal\|italic` | This face's variant keys. |
| `--url <url>` | Record a `url:` pin hint (see below). |
| `--license-file <path>` | Copy the licence text into the pack. |
| `--redistributable` | Mark the pack redistributable. **Off by default** — a licensed font usually may not be. |
| `--embedding-attested` | See below. |
| `--dir <path>` | Font dir to create the pack in. Default: the first of `$SHOJIKU_FONT_DIR`, else `./packs/fonts`. |

Ids are the same charset a `uses:` entry takes: letters, digits, `-`,
`_`, 1–64 characters.

The command refuses rather than writing a pack the engine would later
reject: a file that does not parse as a font, a face id the pack already
declares, a file name already present with different bytes, a second
licence in one pack, and a manifest already there that will not parse.
A refusal writes nothing at all.

**If the font's OS/2 `fsType` forbids embedding**, `font add` refuses it
— the renderer would refuse it too (`font_embedding_restricted`), so the
useful place to say so is before the pack exists. `--embedding-attested`
asserts a separately held embedding licence and writes
`embeddingAttested: true`; the run says on stderr that the guard no
longer applies to that pack. There is no silent path between the two.

Shojiku never scans system fonts. A pack exists because someone ran this
command, and it is loaded because a run named it — so what a document was
rendered with is an input, not a property of the machine.

### Using a pack the locale does not name (`--font-pack`)

A pack is loaded only if it is named. A locale's own `fonts.uses` is one
way; the other is per run:

```bash
shojiku render --templates templates.yml --params params.json \
  --output out.pdf --font-pack my-corporate
```

`--font-pack <id>` is repeatable and **adds to** the locale's `uses`
rather than replacing it — which is what makes it the short way round:
an overlay's sequences replace, so putting one pack into builtin `ja-JP`
by hand means restating `[biz-ud, ipamj-mincho, noto-sans-mono]` too.

These packs resolve **before** the locale's own, so a face id they
declare shadows a bundled one of the same id — the same "earlier wins"
rule that lets an earlier `--font-dir` override a bundled pack. A hostile
id is refused by the same guard a locale pack's entry meets; the flag
buys no trust.

Put the pack in the locale's `uses` instead when every render of that
locale should have it (a deployment's corporate font); use
`--font-pack` when one run needs it.

### Pinned faces & auto-fetch (`url:`)

A face may carry a **`url:`** alongside its `sha256`, so a pack can travel
as a *pinned reference* — a `manifest.yml` whose font files are not
present:

```yaml
faces:
  - id: noto-sans
    file: NotoSans-Regular.ttf
    sha256: 478c558e…                                   # the guarantee
    url: https://github.com/notofonts/…/NotoSans-Regular.ttf   # only a hint
```

When a declared `file` is missing, the **CLI** fills a local cache before
rendering: cache hit → use it; otherwise fetch `url`, check the bytes
against `sha256`, cache, and use them. A mismatch is a hard error and the
bytes are discarded — **never** a fallback to a different font, which
would silently change the document. Faces whose files ARE present are
untouched (no cache, no network).

This is the only network access in the tool, it happens *before* layout,
and it only fills a cache — **rendering, signing, and verifying never open
a socket**. A face resolved from the cache renders byte-for-byte what an
installed one does.

| Flag / variable | Effect |
| --- | --- |
| *(default)* | Missing pinned faces are fetched automatically. |
| `--offline` | Never fetch. A missing, uncached face is an error. Warm cache + `--offline` = air-gapped runs, identical output. |
| `--font-fetch-allow <host>` | Trust an extra host (repeatable), e.g. an internal mirror. |
| `$SHOJIKU_CACHE_DIR` | Cache location. Defaults to `$XDG_CACHE_HOME`/`~/.cache/shojiku` (Linux), `~/Library/Caches/shojiku` (macOS), `%LOCALAPPDATA%\shojiku` (Windows). |

`url:` is fetched only from `fonts.gstatic.com`, `github.com`,
`objects.githubusercontent.com`, and `raw.githubusercontent.com` (https
only, checked on every redirect hop) unless `--font-fetch-allow` widens
it. The allowlist is defense-in-depth — the sha256 pin is the actual
integrity control; the list just bounds where a manifest can point the
host. Cached blobs are named by their digest and re-verified on read, so a
corrupted cache heals itself rather than failing forever.

Older engines **reject** a manifest containing `url:` (unknown keys are
parse errors), so a tool that generates pinned manifests should gate on
the `fonts.face.url` capability key.

A WASM host reads the pins back through `fontFacesNeeded(packId)` —
JSON `[{file, url?}]` for a declared (injected, not-yet-loaded) pack —
so it can fetch a pinned pack's bytes itself without re-parsing
`manifest.yml`; the sha256 stays engine-side and is verified at load
exactly as above. Capability key `wasm.fonts.faces`; the file-name-only
`fontFilesNeeded` is unchanged.

### Fallback chain

A glyph the chosen face cannot map is drawn by the first face in the
locale's `fallback` chain that has it, before the `.notdef` box. It is
bundled-only (never system fonts, to keep sign/verify reproducible) and
per-glyph: within one run, characters the primary covers stay in it and
only the uncovered ones swap to a fallback face. `missing_glyph` warns
only when **no** face in the chain maps the character.

### Face variants

`fontWeight: bold` / `fontStyle: italic` pick the family's matching face
when one exists; the weight and style axes fall back independently (a
`bold italic` request against a family with only a real *bold* keeps the
real bold and synthesizes just the italic). When no real variant exists
the engine renders the effect **synthetically** (faux stroke / skew —
[style.md](style.md)). The `biz-*-gothic` families ship a real **Bold** and
`noto-sans` ships real bold/italic/bold-italic; `ipamj-mincho` ships no
variants, so `bold`/`italic` on it is synthetic.

## What else the locale data controls

- `dateFormats` / `datetimeFormats` — named patterns the `format`
  variants select (`{issued_at:date}`, `format: long`); see
  [data-binding.md](data-binding.md) for the pattern tokens.
- `number.groupSeparator` / `number.decimalSeparator`, plus optional
  `number.groupSize` (digits in the rightmost group, default 3) and
  `number.secondaryGroupSize` (the repeating size left of it, default =
  `groupSize`) — CLDR `#,##,##0` locales set 3 + 2, giving Indian
  `1,23,45,678`. A size of `0` disables grouping.
- `currency.<CODE>` — symbol, precision, and layout
  (`"{symbol}{amount}"`) per currency; `currencyDefault` when neither
  the field nor definitions names one.
- `units` — quantity unit strings (`点`, `items`).
- `weekdaysShort` — the `E` token's names.
- `eras` (`[{ name, start: "yyyy-mm-dd" }]`) + `eraYearOne` — the era
  table behind the `G`/`y` pattern tokens (wareki); see
  [data-binding.md](data-binding.md).

Every key can be overridden per key by an overlay file — an overlay only
needs the keys it changes (see `packs/locale/README.md`).

Capability keys: `locale.builtin` (the ja-JP/en-US builtins + the
overlay merge; engines without it need a pack file even for those two).
The shipped `packs/locale/` packs are host-supplied data, not a
capability.

## Limitations

- `fontFamily` names a loaded face id, not a system font. An unmatched family
  falls back to the default face (`unknown_font_family`, warned once per
  family) rather than failing.
- Characters no loaded face can map render as tofu (`missing_glyph`).
- Rendering never uses the network. A pinned face is fetched at
  authoring/bundle time; `--offline` refuses instead, and an image source is
  refused outright (`remote_asset_unsupported`).
- A pack is loaded only when something NAMES it — a locale's `fonts.uses`, or
  `--font-pack`. Dropping a pack directory in place does not make it
  available.

## See also

- [data-binding.md](data-binding.md) — how `{key:format}` uses these
- [style.md](style.md) — `fontFamily` / `fontWeight` / `fontStyle`
- [README.md](README.md#rendering-a-template) — passing `--lang` / `--font-dir` / `--locale-dir`
