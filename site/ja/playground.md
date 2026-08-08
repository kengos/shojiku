---
title: プレイグラウンド
description: "YAMLを書き換えると、その場で描画が変わります。ページの中でエンジンのWebAssemblyビルドが動いています。"
---

# プレイグラウンド

MDNのドキュメントのように、YAMLの変更で見た目がその場で変わるようにしてあります。デモの数はまだ少ないですが、順に増やしていきます。

以下のデモはすべて <ClientOnly><EngineVersion /></ClientOnly> で動いています。公開済みのリリースそのもので、インストールして手元で動かすものと同じバージョンです。

## テキストスタイル

スタイルは、CSSとほぼ同じ書き方にしてあります。`text-align`が`textAlign`になる、といった違いはあります。ここでは`textAlign`、`fontSize`、`lineHeight`、`letterSpacing`をコントロールで変えられます。ボックスの高さは`fontSize × lineHeight`から計算され、高さを固定したボックスがこの値より低いと`text_overflow`の警告が出ます。この挙動は[リファレンス](/ja/reference/text)にも書いてありますが、ここでは実際に動かして確かめられます。

<ClientOnly><PropertyPlayground demo="text" /></ClientOnly>

## flexレイアウト

CSSのflexの仕組みはご存知でしょうか。

```css
.row { display: flex; gap: 8px; }
.row > div { flex: 1; }  /* 幅を書かない子が等分 */
```

Shojikuでは、ほぼ同じ仕組みでレイアウトを組むことができます。flex行では、幅を書かなかった子が残り幅を等分します。3カラムを作るプロパティはなく、幅を書かない子を3つ置くと3カラムになります。子の数とgapを変えて確かめてください。

<ClientOnly><PropertyPlayground demo="flex" /></ClientOnly>

幅を書いた子と、書かない子を混ぜることもできます。次の例では、左の1つだけ`w`を指定していて、残りの2つが余った幅を等分します。左の幅を動かすと、右の2つが同じだけ狭くなります。

<ClientOnly><PropertyPlayground demo="flexw" /></ClientOnly>

## フォント

書体は、`style`の`fontFamily`で指定します。指定できるのは、フォントパックとしてインストールしてある書体だけです。このページには、BIZ UDPゴシックとNoto Sans Monoのパックが読み込まれています。コントロールを動かすと、ラテン文字の行の`fontFamily`が切り替わります。日本語の行は`fontFamily`の指定なしで、ロケール既定のBIZ UDPゴシックのままです。自分のフォントをパックとして追加する手順は、[チュートリアル](/ja/tutorials)にあります。

<ClientOnly><PropertyPlayground demo="font" /></ClientOnly>

## 文字マスと縦書き

原稿用紙のような文字マスを作る`char_grid`のデモです。`writingMode`はスタイルではなくアイテム直下のキーで、`vertical_rl`にすると文字が縦に並び、行は右から左へ進みます。セルの大きさは`grid.cellSize`で指定します。

<ClientOnly><PropertyPlayground demo="grid" /></ClientOnly>

## リファレンスへ

ここには、動かすと分かりやすい代表的なプロパティだけを置いています。全プロパティの一覧は[リファレンス](/ja/reference/)（機能ごとに1ページ）にあります。
