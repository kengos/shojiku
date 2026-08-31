---
reference:
  group: item-keys
  order: 3
  keys: [visible]
  shapes: [VisibleBinding]
  summary: "Show an item only for some data: the form-mark presence predicate on any item, reserving its box or removing it from layout."
---

# `visible:` — show an item only for some data

Every item takes a `visible:` key. When the predicate holds the item draws
exactly as it always did; when it does not, the item is not shown.

```yaml
- type: image
  box: { x: 400, y: 40, w: 80, h: 80 }
  src: assets/approved-stamp.svg
  visible: { key: status, equals: approved }
```

This is the presence binding form marks already use, generalized to the whole
item vocabulary — the same keys, the same truth table, the same diagnostics
about a literal that can never match. What it adds is a choice about the
SPACE the item leaves behind.

## The predicate

<!-- rf:table:start visible#the-predicate (generated — edit the catalog or reference/tables.yml, then `make reference:generate`) -->
| Key | Meaning |
| --- | --- |
| `key` | the params field to read (dotted paths allowed) — **required** |
| `equals` | a string, number or boolean the value must equal. Omitted: the value is read as a boolean and the item shows when it is `true` |
| `scope` | `element` (default) or `document` — which data the key resolves against inside a `repeat` cell |
| `collapse` | `true` removes the item from layout instead of reserving its box |
<!-- rf:table:end -->

Equality is **type-strict**: `equals: "2"` never matches a numeric `2`. An
**array** value is a multi-select — the item shows when the array *contains*
`equals`, which is what a checkbox group's params look like.

A key that is missing from params, or whose value simply does not match, hides
the item **silently** — a blank form draws nothing and says nothing. Only a
value the predicate *cannot use* warns (see [diagnostics](#diagnostics)).

Inside a `repeat` cell the key resolves against the bound element, so each
element decides for itself. `scope: document` is the escape a page-global flag
needs — the same escape a text
[binding](data-binding.md) takes.

## The two semantics

**Default — the box is reserved, nothing is painted.** Everything around the
item stays exactly where it was. This is the form-mark posture: a blank↔filled
params pair never shifts the layout by a point, so a form prints with the same
geometry whether or not a field is filled in.

**`collapse: true` — the item generates no box at all.** Its siblings close up
over it, and its gap goes with it: in a flow the next item moves up by the
hidden item's height *plus* the gap that separated them; in a flex row the
remaining children divide the full width; in a grid the vacated cell is
reused rather than left empty.

```yaml
# A clause that belongs only to some contracts, with the paragraphs
# after it closing up when it does not apply.
- type: text
  text: "{clause.warranty}"
  visible: { key: contract.kind, equals: extended, collapse: true }
```

These are the two CSS behaviours, and the key name is CSS's own: `collapse` is
what [CSS 2.1 §11.2](https://www.w3.org/TR/CSS21/visufx.html#visibility)
calls removing the box, while the default matches the same clause's
`visibility: hidden` and `collapse: true` produces the effect
[CSS Display 3 §2.5](https://www.w3.org/TR/css-display-3/#box-generation)
gives `display: none`.

**Hiding an item hides everything inside it.** A hidden `container` paints no
child, and a collapsed one takes its whole subtree with it. CSS lets a
descendant re-assert `visibility: visible` to escape a hidden ancestor; there
is no wire spelling for that here, so the two behave identically for every
document this format can express.

## Per item type

The key means the same thing on all fifteen item types. Two are worth
spelling out:

- **`page_break`** paints nothing and reserves no box, so `collapse` makes no
  difference to it: a break whose predicate fails simply does not happen. This
  is how a conditional page break is authored.
  ```yaml
  - type: page_break
    visible: { key: order.long_form }
  ```
- **A band item** (header/footer) and an item in an **absolute** body are
  positioned outright, so nothing moves either way. The two semantics differ
  only in whether `inspect` reports a placement for the item — which is what
  lets an editor show where a hidden item would have been.

Table **columns** and **rows** are not items and take no `visible:`. A row
already chooses its style by predicate through
[`conditionalStyles`](table.md); a column's presence is not conditional.

## Stacking alternatives

Because the box is reserved by default, several items can share one
coordinate and take turns:

```yaml
- type: image
  box: { x: 400, y: 40, w: 80, h: 80 }
  src: assets/approved.svg
  visible: { key: status, equals: approved }
- type: image
  box: { x: 400, y: 40, w: 80, h: 80 }
  src: assets/rejected.svg
  visible: { key: status, equals: rejected }
```

Every candidate asset is named in the template, so nothing about which file
is drawn comes from params — the asset policy is unchanged.

## Limitations

- **Table columns and rows take no `visible:`.** They are not items. A row
  already chooses a style by predicate through `conditionalStyles`
  (`row_condition_type_mismatch` and friends); a column's presence is fixed.
- **A hidden item is still measured.** The default reserves its box, so its
  content is laid out and then not painted — an item that overflows while
  hidden still reports the overflow (`child_overflow`, `sheet_overflow`),
  because the geometry it would occupy is real.
- **A value the predicate cannot use hides the item rather than showing it.**
  Both faults are warnings, not errors, and the item does not draw
  (`visible_type_mismatch`, `visible_value_not_bool`) — matching what a form
  mark does with the same fault. A document that renders blank where content
  was expected is worth checking for those two first.

## Diagnostics

| Code | When |
| --- | --- |
| `visible_not_boolean` | the field is declared non-boolean and the binding has no `equals`, so the predicate can never hold |
| `visible_equals_not_declared` | the `equals` literal is outside the field's declared `enum` |
| `visible_type_mismatch` | the value's type differs from `equals` (also raised at validate against the DECLARED type) |
| `visible_value_not_bool` | an `equals`-less binding's value is not a boolean |

All four are warnings and all four leave the item **not shown**, matching what
a form mark does with the same fault. The literal is never echoed — the key
names the field.

Capability key: `item.visible`. An engine that predates this key rejects it as
an unknown field, so a tool that writes `visible:` should gate on the
capability rather than write it hopefully.
