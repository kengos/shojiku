---
reference:
  group: root
  order: 3
  keys: [document]
  shapes: [DocumentMeta]
  summary: "Document metadata written into the PDF's properties: title, description, keywords, language, authors."
---

# `document:` — document metadata

What the file says it *is*, as opposed to what it draws: the title,
description, keywords, language and authors that land in the PDF's
document properties. A reader's Properties panel shows them, a search
index reads them, a screen reader announces the language — and an AI
consumer handed the file can tell what it is holding without parsing the
page.

Nothing here appears on the page. PNG previews carry none of it (the
format has no metadata channel), exactly as they carry no
[links](link.md).

## Syntax

```yaml
document:
  title: 請求書 {invoice.number}
  description: '{invoice.subject}（{billing.name} 様）'
  keywords: [請求書, invoice, '{invoice.number}']
  language: ja-JP
  authors: ['{issuer.name}']
```

| Key | Type | Description |
| --- | --- | --- |
| `title` | string | The document title. Unset → the template `name:`, then `Shojiku Document`. |
| `description` | string | A short summary (the PDF `/Subject`). |
| `keywords` | list of strings | Search keywords. Max 64 entries. |
| `language` | string | BCP 47 tag (`ja-JP`). Unset → `defaults.locale`. |
| `authors` | list of strings | Max 64 entries. |

Every value takes `{key}` / `{key:format}` interpolation exactly like
static text, resolved against top-level params. Unknown keys inside
`document:` are parse errors (typo safety).

There is no `bindings:` map here, so an interpolation name must be
inside the reference charset (`A-Z a-z 0-9 _ .`) — a non-ASCII params
key cannot be referenced from `document:`, and writing one warns
`interpolation_key_charset` like anywhere else.

## Where each value goes

| Key | PDF `/Info` | XMP | Also |
| --- | --- | --- | --- |
| `title` | `/Title` | `dc:title` | |
| `description` | `/Subject` | `dc:description` | |
| `keywords` | `/Keywords` (comma-joined) | `pdf:Keywords` | |
| `authors` | `/Author` (comma-joined) | `dc:creator` | |
| `language` | — | `dc:language` | the catalog `/Lang`, which is what assistive technology reads |

## Rules

- **Blank is unset.** A value that interpolates to nothing (a blank
  binding) writes nothing and reports nothing beyond the ordinary
  `missing_data` warning; an empty list entry is dropped.
- **A rejected value is not replaced.** The `title` → `name` and
  `language` → `defaults.locale` fallbacks cover an *absent* value only.
  If a value is rejected (below), the field is simply not written — a
  substituted value would hide the refusal behind plausible output.
- **Rejections** (each a warning of its own; the field is dropped and
  everything else still renders):
  - control characters in any value — they are invalid in the XMP
    packet whatever the escaping, and confuse readers in `/Info`;
  - a value over 2048 bytes after interpolation;
  - a `language` that is not `[A-Za-z0-9-]`, or over 64 bytes. The tag
    is the one metadata value written into the XMP packet *unescaped*,
    so the charset is a hard requirement rather than tidiness.
- **Over-long lists** warn `too_many_document_entries` and only the
  first 64 entries are written.
- **No creation date.** `creationDate` is deliberately not authorable
  and none is written: a rendered timestamp would make the same inputs
  produce different bytes, and byte-identical output is what signing and
  verification rest on.

## Limitations

- PDF only. PNG previews have no metadata channel, so nothing here is
  observable in a preview.
- `keywords` and `authors` are capped at 64 entries; only the first 64 are
  written (`too_many_document_entries`).
- Each value is capped at 2048 bytes, and `language` at 64
  (`document_metadata_too_long`); control characters are refused
  (`document_metadata_control_chars`) and `language` must be a
  `[A-Za-z0-9-]` tag (`invalid_document_language`).

## Diagnostics

| Code | When |
| --- | --- |
| `document_metadata_control_chars` | a resolved value carries control characters |
| `document_metadata_too_long` | a resolved value is over the byte cap (2048; 64 for `language`) |
| `invalid_document_language` | `language` is not a `[A-Za-z0-9-]` tag |
| `too_many_document_entries` | `keywords` / `authors` over the 64-entry cap |
| `missing_data` | an interpolated key is not in params |
| `interpolation_key_charset` | a `{…}` name that cannot be an interpolation key |

Capability key: `template.document.metadata`.
