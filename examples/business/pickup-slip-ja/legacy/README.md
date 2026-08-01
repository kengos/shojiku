# legacy/ — the "before" of the migration walkthrough

These two files are a **synthetic, hand-authored teaching sample**, not a real
Thinreports export and not anyone's production code. They exist so
[docs/migration-thinreports.md](../../../../docs/migration-thinreports.md) has a
concrete "before" to migrate from, and so an AI agent running
[skills/shojiku-thinreports-migrator](../../../../skills/shojiku-thinreports-migrator/SKILL.md)
has something to practise on.

| File | Stands in for |
| --- | --- |
| `pickup_slip.tlf` | the legacy **layout**: absolute coordinates, every rule a separate line item, one style block copy-pasted per text block |
| `pickup_slip_report.rb` | the legacy **host code**: the data dictionary the layout lacks, including the format-key explosion the migration collapses |

They are shaped after a Thinreports 0.9 layout and a typical Ruby
Value-object host, but they are **not byte-compatible with any Thinreports
version** and nothing in this repository parses them — Shojiku declares no
Thinreports compatibility and ships no `.tlf` importer
([docs/architecture.md](../../../../docs/architecture.md) § Goals / Non-goals).
Migration is visual regeneration: an agent *reads* these as context and
re-authors the document natively. The re-authored result is the
`definitions.yml` / `templates.yml` / `params.json` in the parent directory.

The content is fictional 正直堂 sample data (see the repository's sample-content
policy): no real people, no real addresses, and every URL is under
`*.shojikudo.example`.
