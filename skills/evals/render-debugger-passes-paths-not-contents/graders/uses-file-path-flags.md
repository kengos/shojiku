---
type: regex
match: contains
pattern: --templates?\b
---
The command passes the template by PATH. The skill requires the
file-path flags whenever files exist, precisely so file content never
travels through a shell string.
