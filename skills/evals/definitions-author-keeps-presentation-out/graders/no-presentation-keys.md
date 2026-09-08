---
type: regex
match: not_contains
pattern: "(align|bold|width|currency|format|era)\\s*:"
flags: "i"
---
The definitions.yml the answer produces carries no presentation key. This is the
rule stated verbatim as a pattern — geometry, weight, width, currency, format and
era wording all belong in the template's defaults/styles or the locale packs, not
in the data contract.

It pairs with the judgment grader beside it: that one asks whether the answer
UNDERSTOOD the split, this one whether the file it wrote actually honours it.
