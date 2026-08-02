---
title: Playground
---

# Playground

Turn a knob, watch the page change. Each block generates a small template
from the control values and renders it with the engine in your tab — the
YAML you see is exactly what rendered.

## Text style

`textAlign`, `fontSize`, `lineHeight`, `letterSpacing`. The box height is
computed from `fontSize × lineHeight` — the
[reference](https://github.com/kengos/shojiku/blob/main/docs/engine/text.md)'s
rule that a fixed-height box below that product raises `text_overflow` is
one you can verify with the slider.

<ClientOnly><PropertyPlayground demo="text" /></ClientOnly>

## Character grids and vertical writing

The manuscript-paper `char_grid`. `writingMode` is an item-level key, not a
style property; `vertical_rl` turns lines into right-to-left columns. Cell
size is `grid.cellSize`.

<ClientOnly><PropertyPlayground demo="grid" /></ClientOnly>

## The full story

The complete property list lives in the
[reference](https://github.com/kengos/shojiku/blob/main/docs/engine/README.md)
— one page per feature. This page holds only the properties whose behavior
travels faster as motion than as words.
