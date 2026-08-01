# Migrating a Thinreports report to Shojiku — a worked walkthrough

Shojiku declares **no Thinreports compatibility**: there is no `.tlf`
importer, and writing one is a non-goal
([architecture.md](architecture.md) § Goals / Non-goals). Migration is
**AI-assisted visual regeneration** — an agent *reads* the legacy layout and
host code as context and **re-authors** the document natively. AI code-reading
is the introspector; that is exactly why no parser is needed.

This page walks one migration end to end so the method is concrete. The
agent-facing playbook is
[skills/shojiku-thinreports-migrator/](../skills/shojiku-thinreports-migrator/SKILL.md)
(AI-only instructions); this page is the worked example a human can read to
decide whether the approach fits their report.

## The material

Everything below lives in [`examples/business/pickup-slip-ja/`](../examples/business/pickup-slip-ja/)
— a 正直堂 bookstore's **お取り置き引取票** (book-reservation pickup slip).

| | |
| --- | --- |
| **Before** | [`legacy/pickup_slip.tlf`](../examples/business/pickup-slip-ja/legacy/pickup_slip.tlf) — the layout; [`legacy/pickup_slip_report.rb`](../examples/business/pickup-slip-ja/legacy/pickup_slip_report.rb) — the Ruby host that fills it |
| **After** | `definitions.yml` + `templates.yml` + `params.json` in the same directory, rendering [`output.pdf`](../examples/business/pickup-slip-ja/output.pdf) / [`preview-1.png`](../examples/business/pickup-slip-ja/preview-1.png) |

> The two `legacy/` files are a **synthetic, hand-authored teaching sample** —
> shaped after a Thinreports 0.9 layout and a typical Value-object host, but not
> byte-compatible with any Thinreports version, and nothing in this repository
> parses them. See [`legacy/README.md`](../examples/business/pickup-slip-ja/legacy/README.md).
>
> The third legacy artifact — **the rendered sample PDF/PNG the old system
> prints** — is the one thing this repository cannot ship, because producing it
> would mean running Thinreports. In a real migration it is the most important
> input: it is the acceptance target you compare your render against, page by
> page. Ask for it before you start; without it the migration evidence is weak.

## What each legacy artifact gives you

- **The `.tlf` gives you the visual layout**, and only that: absolute
  coordinates, every rule its own `s-line` item, and one style block
  copy-pasted per text block. Read it for *what the document shows and how it
  groups* — not to reproduce its geometry. Its ids
  (`order_reservation_number`, `pickup_schedule_from_jp`) hint at data keys but
  carry no schema.
- **The host code gives you the data dictionary the `.tlf` lacks.** The real
  keys live there implicitly, and so does the pain the migration exists to
  remove (below).
- **The rendered sample is the acceptance target.**

## Mapping table — legacy → Shojiku

Region by region, what became what. This is the record that the data dictionary
was *extracted*, not guessed.

| Legacy (id / region) | Where it lived | Shojiku |
| --- | --- | --- |
| `shop_title` | `.tlf` text block | template literal (it is not data) |
| `order_reservation_number` (+ its separate `_label` block) | `.tlf` + host | `reservation.number`; the label is template text |
| `reserved_at`, `reserved_at_jp`, `reserved_at_date` | host, three keys | **`reservation.reserved_at`** (`format: date`) |
| `customer_name` + `customer_name_suffix` (`様`) | two text blocks | `customer.name`, with `様` in the template's text |
| `customer_member_number` (`"会員番号 M-…"`) | host string, label baked in | `customer.member_number` + template label |
| `customer_tel` (`"TEL …"`) | ditto | `customer.tel` + template label |
| `pickup_schedule_from`, `pickup_schedule_from_jp` | host, two keys | **`reservation.pickup_from`** (`format: date`) |
| `pickup_schedule_to`, `pickup_schedule_to_jp`, `pickup_deadline_notice`, `notice_line_2` | host, four keys (two are sentences with the date interpolated in Ruby) | **`reservation.pickup_to`**, interpolated in the template's own text |
| `pickup_schedule_separator` (`〜`) | its own text block | one character in one interpolated line |
| `pickup_branch` (`"お引取店舗: …"`) | host string, label baked in | `reservation.branch` + template label |
| 7 × `s-line` + 3 header text blocks + `s-list reserved_books` | a hand-drawn line-item box | **one `table`** over `books` |
| `book_title`, `book_author` | list-row text blocks | `books[].title`, `books[].author` |
| `book_price_yen` (`"¥1,980"`, formatted in Ruby) | host | **`books[].price`** (`type: number`, `format: currency`) |
| `book_status_label` (`"（入荷待ち）"`, a Ruby ternary) | host | `books[].status` — labeled `enum` members (`{ value: backorder, label: 入荷待ち }`) print the words; `row.conditionalStyles` still shades the rows |
| `reserved_books_count` (`"5点"`) | host string | **`totals.count`** (`type: integer`, `format: quantity`) |
| `price_total_label` + `price_total_yen` (`"¥14,880"`) | label block + Ruby-formatted string | **`totals.amount`** (`format: currency`) + template label |
| `notice_box` + `notice_line_1..3` | `s-rect` + three text blocks | one bordered container + one block-scalar text |
| `printed_at_datetime` (`Time.now.strftime`) | host | `meta.printed_at` (`format: date-time`), supplied by the caller |
| 29 per-text-block `style` maps, near-identical | `.tlf` | two named `styles` + a few inline ones |

### The format-key collapse

The single biggest reduction. A legacy layout can only print strings, so the
host pre-materializes every display variant as its own key — and the caller has
to keep them in sync by hand. **Twelve display-shaped keys become six typed
fields**, and the template picks the variant:

| Legacy keys | Shojiku field |
| --- | --- |
| `reserved_at`, `reserved_at_jp`, `reserved_at_date` | `reservation.reserved_at` |
| `pickup_schedule_from`, `pickup_schedule_from_jp` | `reservation.pickup_from` |
| `pickup_schedule_to`, `pickup_schedule_to_jp`, `pickup_deadline_notice`, `notice_line_2` | `reservation.pickup_to` |
| `price_total_yen` | `totals.amount` |
| `book_price_yen` | `books[].price` |
| `reserved_books_count` | `totals.count` |

Collapsing these is the *point* of the type system — preserving the sprawl
would migrate the pain along with the report.

## Design notes — where this departs from the legacy geometry, on purpose

- **A4 → A5.** The `.tlf` declares `paper-type: A4`, but every item sits inside
  a ~340 × 480 pt region: a slip printed on A4 stock. The re-authored template
  is A5, the size the content actually is. *(Check this against the real print
  workflow before copying the decision — stock and printer may be the reason.)*
- **Absolute coordinates → a `flow` body.** In the legacy file every element's
  `y` is a constant, so a detail row more than expected means re-positioning
  everything below it by hand. The re-authored body is a flow: the table grows
  and the totals, the notice box, and the print stamp move with it.
- **Seven `s-line` items → one `table`.** The hand-drawn box is where legacy
  reports rot — rules drift by a point, columns stop lining up with their
  headers. A `table` declares the columns once and the engine draws the grid.
  Where honest table output looks *different* from the hand-drawn original,
  that is a better match to intent, not a regression.
- **Copy-pasted style blocks → named `styles`.** Two named styles cover what
  29 near-identical per-text-block style maps did.
- **Labels move out of the data.** `"会員番号 M-004821"` and
  `"お引取店舗: …"` arrived from the host with their labels concatenated in.
  The label is presentation: it belongs in the template, and the field carries
  only the value.
- **`Time.now` moves to the caller.** The legacy host stamped the print time
  itself. Shojiku renders deterministically and has no clock, so
  `meta.printed_at` is a normal typed parameter.

## Gap report — what the migration could not express

Reported rather than worked around; distorting the definitions to force a match
would defeat the purpose.

- ~~**No declarative enum → label mapping.**~~ **Closed** — an `enum`
  member now takes a `{ value, label }` form
  ([definitions.md](engine/definitions.md) § Enum display labels), and
  the bundled slip declares `入荷済み`/`入荷待ち` on `books[].status` and
  prints them in a 状況 column; params still carry the machine values the
  legacy host's Ruby ternary used to translate. (At the time of the
  walkthrough the gap was real: the first version of the slip expressed
  the status as presentation only — `row.conditionalStyles` shading plus
  a legend line, both of which remain.)
- ~~**Layout warnings do not name the item.**~~ **Closed** — layout
  diagnostics now carry the raising item's structural path
  ([diagnostics.md](engine/diagnostics.md), capability
  `diagnostics.layout.path`), so a `text_overflow` names the item it
  happened in. (At the time of the walkthrough the gap was real: getting
  the slip WARNING-clean meant chasing
  `text_overflow: 12.6pt content vs 12pt available` with no item path in
  the message — the culprit, a fixed `header.height` on the table, was
  found by inspecting the layout tree.)

## Run it yourself

The commands are the ones in the template-author skill's **Engine access**
section — the canonical MCP-first / CLI-fallback table
([skills/shojiku-template-author/](../skills/shojiku-template-author/SKILL.md)),
never restated here. In short: `validate` until the diagnostics are clean,
`preview` and **look at every page**, `inspect` when a warning does not say
where it is, `render` for the PDF. From a repository checkout:

```bash
shojiku validate --definitions examples/business/pickup-slip-ja/definitions.yml \
  --templates examples/business/pickup-slip-ja/templates.yml \
  --params examples/business/pickup-slip-ja/params.json
```

To practise the migration itself, point an agent at
[skills/shojiku-thinreports-migrator/](../skills/shojiku-thinreports-migrator/SKILL.md)
and hand it the two `legacy/` files (plus your own rendered sample) — then
compare what it produces against the `templates.yml` beside them.

## Is your report a fit?

The method transfers to any absolute-coordinate report tool, not just
Thinreports. It works best when the legacy report's **look** is the
specification and its host code is readable. It does not help with logic
embedded in the report engine itself — Shojiku's engine does no arithmetic and
runs no business rules, so anything the legacy host computed
(totals, tax splits, counts) stays in the calling application and arrives as
data. That is a deliberate boundary, not a missing feature
([architecture.md](architecture.md)).
