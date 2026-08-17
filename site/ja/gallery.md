---
title: ギャラリー
description: "請求書、領収書、履歴書、原稿用紙。リポジトリに同梱された実例テンプレートと、CLIがそこから出力したPDFの一覧。"
---

<script setup>
import { data } from '../gallery.data.ts'
</script>

# ギャラリー

ここにある{{ data.length }}点は、すべてリポジトリに入っている実例です。それぞれ `templates.yml` と `definitions.yml` と `params.json` の三つのファイルからできていて、CLIに渡すと下の画像と同じPDFが出ます。同じ入力からは常に同じ出力になるので、CIが毎回バイト単位で照合しています。

<GalleryGrid :entries="data" lang="ja" />
