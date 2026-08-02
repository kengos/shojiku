---
title: プレイグラウンド
---

# プレイグラウンド

つまみを回すと、ページが変わります。各ブロックはコントロールの値から小さなテンプレートを生成し、あなたのタブの中のエンジンでレンダリングします。表示されているYAMLが、いまレンダリングされたものそのものです。

## テキストスタイル

`textAlign` と `fontSize` と `lineHeight` と `letterSpacing`。ボックスの高さは `fontSize × lineHeight` から計算されています。固定高のボックスはこの積より低いと `text_overflow` が出る、という[リファレンス](https://github.com/kengos/shojiku/blob/main/docs/engine/text.md)の記述を、つまみで確かめられます。

<ClientOnly><PropertyPlayground demo="text" /></ClientOnly>

## レイアウト：省略が段組みになる

flex行のルールは一つ。幅を書かなかった子が、残り幅を等分します。3カラムはプロパティではなく、幅を主張しない子が3ついるという状態です。本数とgapを動かして確かめてください。

<ClientOnly><PropertyPlayground demo="flex" /></ClientOnly>

## フォント

フォントはパックで、`fontFamily` に書けるのはアクティブなロケールが `uses` するパックの書体だけです。ja-JPのここでは BIZ UDPゴシックと Noto Sans Mono。日本語の行はロケール既定の書体のまま、つまみはラテン行の書体を入れ替えます。自社フォントの追加も同じ仕組みです（[チュートリアル](/ja/tutorials)）。

<ClientOnly><PropertyPlayground demo="font" /></ClientOnly>

## 文字マスと縦書き

原稿用紙の `char_grid` です。`writingMode` はスタイルではなくアイテム直下のキーで、`vertical_rl` にすると行が右から左の列になります。セルの大きさは `grid.cellSize` です。

<ClientOnly><PropertyPlayground demo="grid" /></ClientOnly>

## 本編へ

プロパティの全リストは[リファレンス](https://github.com/kengos/shojiku/blob/main/docs/engine/README.md)（機能ごとに1ページ）にあります。ここに置いたのは、動きが言葉より速く伝わる代表的なものだけです。
