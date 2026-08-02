---
name: shojiku-definitions-author
description: Derive Shojiku's definitions.yml and the params-building code from an existing data source — a database schema, ORM models, or an API payload. Use when a Shojiku document must be fed from data that already lives somewhere, before (or alongside) authoring the template.
---

# Shojiku Definitions Author

> **Audience: AI agents only.** A human gives you access to their schema
> (SQL DDL, ORM models, an API response, a CSV header row) and names the
> document they want; you produce the `definitions.yml` the template
> will validate against, a `params.json` sample, and the code that
> builds params from the real source at render time.

You are building the SEAM between an application's data and a Shojiku
template. The engine validates every template binding against
`definitions.yml` and every params payload against the same file — so
the quality of this file decides whether mistakes surface as diagnostics
at author time or as blank spots on paper.

The definitions schema itself (types, formats, constraints) is
normative in
[docs/engine/definitions.md](../../docs/engine/definitions.md); the
engine-access commands and the authoring wire gotchas live in
[shojiku-template-author](../shojiku-template-author/SKILL.md) — read
both, restate neither.

## The mapping procedure

1. **Read the source of truth, not a description of it.** Ask for the
   DDL / model files / a REAL sample payload. Column types, nullability
   and enum sets are the facts the definitions must mirror.
2. **Shape the params tree by DOCUMENT ROLE, not by table.** A receipt
   wants `recipient.name`, `amount.total_in_tax`, `items[]` — not
   `orders_join_customers`. Nesting mirrors the params JSON exactly;
   top-level objects become the Designer's field groups, so group by
   what a human filling the form would expect.
3. **Line items are `type: array`** with an `items:` object whose keys
   are RELATIVE to one row. Declare `minItems` only when the document
   actually requires a row (a blank order form does not).
4. **Give every money/date/count field its semantic pair**:
   `type: number` + `format: currency`, `type: string` +
   `format: date` (bare `YYYY-MM-DD`) or `format: date-time` (FULL
   RFC 3339 — an offset-less timestamp is refused), `type: integer` +
   `format: quantity` ONLY for a standalone count (it prints the
   locale's counter word — a count with its own unit column stays a
   plain integer).
5. **The engine does no math.** Totals, tax lines, per-rate summaries
   are params fields the host computes; declare them, and write the
   computation into the params-building code, next to the query.
6. **Enums and constraints go in.** A status column with three values
   becomes `enum:`; lengths become `minLength`/`maxLength` when the
   layout depends on them. `title:` in the READER's language — these
   label the Designer's palette.
7. **Blank-form fields get `placeholder`** at the FIELD level, so one
   template serves the blank ↔ filled pair without `missing_data`.
8. **Write the params builder in the host's language**, from the real
   schema to the declared tree — a function that takes the row(s) and
   returns the params object. The worked production shape (SQLite →
   params → PDF inside a Docker image) is
   [examples/deploy/python/render.py](../../examples/deploy/python/render.py);
   mirror its layering: static document facts stay in a committed base
   params file, transactional values come from the query.

## Prove it against the engine

Supplying BOTH definitions and params turns on params-vs-schema
validation — the `params_*` diagnostics (required / type / range /
enum / unknown keys) are the proof this mapping is honest:

1. Build a sample `params.json` through YOUR builder from real rows.
2. `validate` with definitions + template + params (command table in
   shojiku-template-author § Engine access).
3. Fix until clean — a `params_unknown_key` means the builder emits
   something undeclared; a `params_required` means the query can return
   less than the document needs (decide: `placeholder`, a default in
   the builder, or a real `required` failure).
4. Render the preview and LOOK at it: a declared-but-wrong mapping
   (unit price where the amount should be) validates clean and only the
   pixels catch it.

## What NOT to do

- Do not invent per-language reflection tooling that generates
  definitions from live DB connections automatically — the mapping is a
  judgment (roles, grouping, formats), and this skill IS the tool.
- Do not put geometry, display formats, or locale wording into
  `definitions.yml` — formatting lives in the template's `defaults:` /
  `styles:`, locale data in packs.
- Do not lie about shapes to quiet a warning (`type: string` for a
  number, a scalar for a list). The warning is the seam telling the
  truth.
