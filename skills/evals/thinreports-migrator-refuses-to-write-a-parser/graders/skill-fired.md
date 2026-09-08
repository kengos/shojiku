---
type: tool_used
tool: Skill
input_match: shojiku-thinreports-migrator
---
The skill UNDER TEST was loaded — `input_match` is doing the work here, and
without it this grader proves nothing. The sandbox also carries whatever skills
the operator's own `~/.claude` provides (measured at 22 on one machine), so a
`tool_used: Skill` that matches on the tool NAME alone is satisfied by any of
them: a probe that invoked an unrelated global skill passed it.
