---
title: "Uses outside business documents"
description: "Using Shojiku outside work: turn a page from a Japanese recipe site into a printable booklet in your own language."
---

# Tips

Shojiku was built for business documents. This page collects what else it prints well, each one a job you can hand to the AI agent you already have.

## A recipe as a printable PDF

### Who this is for

- You want to cook a Japanese dish from a Japanese recipe site and cannot read the page
- You would rather not touch a phone with wet hands, and the screen keeps going dark anyway

Hand over a recipe URL and you get a PDF: the finished dish and a shopping list on page 1, then one card per step. Where a recipe site publishes no photo of the individual steps, the skill cuts frames out of the cooking video and picks one for each step. The source URL and its QR code sit in the footer of every page, so you can scan your way back to the video when the printout does not settle a question.

The booklet is written in your language throughout, headings and table column labels included. The third column handles the ingredients your supermarket will not stock, like mirin and dashi granules: what to use instead, and a nearby shop that carries the real thing. The parts a Japanese home recipe leaves unsaid get spelled out on the step where they come up: how to make the rolling wedge cut, and why the drop lid rests on the food rather than the pot.

### How to run it

Give your agent the Shojiku skill and MCP server first.

**Claude Code**

```bash
npx skills add kengos/shojiku
```

```bash
claude mcp add shojiku -- \
  docker run --rm -i --entrypoint shojiku-mcp \
  -v "$PWD:/work" -w /work ghcr.io/kengos/shojiku:edge
```

**Claude Desktop / Cursor / VS Code (Copilot)**

Where each one keeps its MCP config, and what to put in it, is in the [quickstart](https://github.com/kengos/shojiku/blob/main/docs/quickstart.md). The skill installs the same way with `npx skills add kengos/shojiku`.

Then ask:

> Turn this recipe into a PDF I can print. `<recipe URL>`

An assistant that runs only in a browser cannot do this. The skill downloads the video, cuts frames with ffmpeg, and runs the engine to write the PDF — all of it on your machine, so it needs an agent that can reach local files and commands.

### What comes out

Here is the bundled sample printed twice. One template, two sets of data.

| | |
| :---: | :---: |
| ![The English recipe booklet: shopping list with a substitutes column](/gallery/lifestyle-recipe-booklet-en/preview-1.png) | ![The same booklet in Japanese, from the same template](/gallery/lifestyle-recipe-booklet-en/preview-ja-1.png) |

Both PDFs are in [examples/lifestyle/recipe-booklet-en/](https://github.com/kengos/shojiku/tree/main/examples/lifestyle/recipe-booklet-en) (`output.pdf` and `output-ja.pdf`), next to the template and the data they came from, so you can swap in your own recipe.

### Before you use it

This fetches a page from a recipe site, so **follow that site's terms and keep it to personal use**. Do not point it at a site to collect recipes in bulk.

Copyright does not reach far into a list of ingredients or a cooking procedure, but **the site's photos, the frames of its video, and the wording of its text are protected**. Print a booklet and cook from it; do not redistribute it.
