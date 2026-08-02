---
title: Gallery
---

<script setup>
import { data } from './gallery.data.ts'
</script>

# Gallery

All {{ data.length }} of these are runnable examples bundled in the
repository. Each one is a `templates.yml`, a `definitions.yml` and a
`params.json` that the CLI renders into exactly the PDF/PNG you see here.
Rendering is deterministic, so CI byte-compares every output on every run.

<GalleryGrid :entries="data" lang="en" />
