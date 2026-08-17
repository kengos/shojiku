---
title: "Edit the YAML in your browser"
description: "Change the YAML and the rendering changes with it — the engine's WebAssembly build runs inside the page."
---

# Playground

Like MDN's interactive examples, the look changes right here as the
YAML changes. The set of demos is still small, and it will grow.

Every demo below runs on <ClientOnly><EngineVersion /></ClientOnly>. That is
a published release — the same version you install and run yourself.

## Text style

Styles are written almost exactly like CSS; the differences are of the
`text-align` → `textAlign` kind. Here you can change `textAlign`,
`fontSize`, `lineHeight` and `letterSpacing` with the controls. The box
height is computed from `fontSize × lineHeight`, and a fixed-height box
lower than that raises a `text_overflow` warning. The
[reference](/reference/text)
describes this behavior; here you can verify it by moving the slider.

<ClientOnly><PropertyPlayground demo="text" /></ClientOnly>

## Flex layout

Do you know how flex works in CSS?

```css
.row { display: flex; gap: 8px; }
.row > div { }           /* each child sizes to its content */
.row > div { flex: 1; }  /* or: ignore content, split evenly */
```

Shojiku lays pages out with the same mechanism, down to the defaults. In
a flex row, a child without a width sizes to its content and stays
there — nothing grows unless you ask, exactly as in CSS. Write
`flexBasis: 0` with `flexGrow: 1` for the even split, which is what
`flex: 1` means. There is no three-column property
either way — put three widthless children in a row and you get three
columns. Move the count and the gap to see it.

<ClientOnly><PropertyPlayground demo="flex" /></ClientOnly>

Children with and without a width can be mixed. Below, only the left
card sets `w`, and the other two split what is left. Move the left
width and the two on the right narrow by the same amount.

<ClientOnly><PropertyPlayground demo="flexw" /></ClientOnly>

## Fonts

A typeface is chosen with `fontFamily` in `style`, and only faces
installed as font packs can be named. This page has the BIZ UDP Gothic
and Noto Sans Mono packs loaded. The control switches the Latin line's
`fontFamily`; the Japanese line has no `fontFamily` and stays on the
locale default, BIZ UDP Gothic. How to add your own font as a pack is
in the [tutorials](/tutorials).

<ClientOnly><PropertyPlayground demo="font" /></ClientOnly>

## Character grids and vertical writing

The manuscript-paper `char_grid`. `writingMode` is an item-level key
rather than a style property; set `vertical_rl` and lines become
right-to-left columns. Cell size is set with `grid.cellSize`.

<ClientOnly><PropertyPlayground demo="grid" /></ClientOnly>

## To the reference

This page holds only the representative properties that are easier to
understand in motion. The full property list is in the
[reference](/reference/)
(one page per feature).
