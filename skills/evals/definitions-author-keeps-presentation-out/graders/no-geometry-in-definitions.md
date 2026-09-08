---
type: llm
---
The definitions.yml the answer produces carries the DATA shape only —
field names, types, whether a value is required, grouping. It does not
carry alignment, boldness, width, position, a currency symbol, a
thousands separator, or era wording. The answer says where those belong
instead: formatting in the template's defaults/styles, locale data in
the packs.

FAIL: silently accepting the request and writing an alignment or a
currency format into definitions.yml.
