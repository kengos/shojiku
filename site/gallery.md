---
title: "Example templates"
description: "Invoices, receipts, resumes, manuscript paper: the runnable example templates bundled in the repository, beside the PDFs the CLI renders from them."
---

<script setup>
import { data } from './gallery.data.ts'
</script>

# Gallery

All {{ data.length }} of these are runnable examples bundled in the
repository. Each one is two YAML files, `templates.yml` and `definitions.yml`, plus a
`params.json` that the CLI renders into exactly the PDF/PNG you see here.
The same input always produces the same output, so CI byte-compares every one of them on every run.

<GalleryGrid :entries="data" lang="en" />
