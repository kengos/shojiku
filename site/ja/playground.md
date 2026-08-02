---
title: プレイグラウンド
---

# プレイグラウンド

つまみを回すと、ページが変わります。各ブロックはコントロールの値から小さなテンプレートを生成し、あなたのタブの中のエンジンでレンダリングします。表示されているYAMLが、いまレンダリングされたものそのものです。

## テキストスタイル

`textAlign` と `fontSize` と `lineHeight` と `letterSpacing`。ボックスの高さは `fontSize × lineHeight` から計算されています。固定高のボックスはこの積より低いと `text_overflow` が出る、という[リファレンス](https://github.com/kengos/shojiku/blob/main/docs/engine/text.md)の記述を、つまみで確かめられます。

<ClientOnly><PropertyPlayground demo="text" /></ClientOnly>

## 文字マスと縦書き

原稿用紙の `char_grid` です。`writingMode` はスタイルではなくアイテム直下のキーで、`vertical_rl` にすると行が右から左の列になります。セルの大きさは `grid.cellSize` です。

<ClientOnly><PropertyPlayground demo="grid" /></ClientOnly>

## 本編へ

プロパティの全リストは[リファレンス](https://github.com/kengos/shojiku/blob/main/docs/engine/README.md)（機能ごとに1ページ）にあります。ここに置いたのは、動きが言葉より速く伝わる代表的なものだけです。
