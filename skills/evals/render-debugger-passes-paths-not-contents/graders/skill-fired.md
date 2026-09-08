---
type: tool_used
tool: Skill
input_match: shojiku-render-debugger
arm: with-only
---
The skill UNDER TEST was loaded. `input_match` is doing the work: the sandbox
also carries whatever skills the operator's `~/.claude` provides, so a
`tool_used: Skill` matching on the tool NAME alone is satisfied by any of them.

Marked `arm: with-only`, so it reads as a plugin-fired INDICATOR rather than
part of the score — it is false by construction on the no-skill arm, and
counting it there would make every ablation delta look better than it is.
