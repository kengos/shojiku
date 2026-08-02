---
title: ギャラリー
---

<script setup>
import { data } from '../gallery.data.ts'
</script>

# ギャラリー

ここにある{{ data.length }}点は、すべてリポジトリ同梱の実例です。どれも `templates.yml` と `definitions.yml` と `params.json` の三つのファイルで、CLIがそのままこの画像のPDF/PNGにレンダリングします。レンダリングは決定的なので、CIが毎回バイト単位で出力を照合しています。

<GalleryGrid :entries="data" lang="ja" />
