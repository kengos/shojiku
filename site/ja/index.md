---
layout: home
title: Shojiku
hero:
  name: Shojiku
  text: YAMLを書けば、帳票になる。
  tagline: 請求書・領収書・申込書・原稿用紙。二枚のYAMLと一つのJSONから、どのマシンでも同じバイト列のPDFを出す、AIエージェント前提の帳票エンジン。
  image:
    src: /brand/hero.png
    alt: Shojikuのヒーローバナー。この画像自体がShojikuのレンダリング出力
  actions:
    - theme: brand
      text: はじめる
      link: /ja/tutorials
    - theme: alt
      text: Designerを開く
      link: /designer/
    - theme: alt
      text: GitHub
      link: https://github.com/kengos/shojiku
---

<div class="sj-note">上のバナーは、このサイトが説明しているエンジンそのものの出力です（200mm×90mmのテンプレート1枚。<a href="https://github.com/kengos/shojiku/tree/main/examples/dev/site-hero/">templates.yml</a>）。右の縦書き二列は原稿用紙スタイルの <code>char_grid</code> で、朱印は空白マスの上に置いた <code>ellipse</code> です。</div>

## YAMLを書き換えて、その場でレンダリングする

エディタの中身は同梱例の実ファイルです。レンダリングはあなたのタブの中のWASMエンジンが行い、何もアップロードされません。最初はラテン文字の例（約1.2MBのフォント）を即時に、日本語の例はボタン一つでBIZ UDゴシック（9MB）を読み込んでから描きます。

<ClientOnly><LiveRenderer /></ClientOnly>

## ふつうのPDFエンジンが諦める文書のために

Shojikuは日本の商習慣の帳票から生まれました。縦書きの小説組版、200字詰の原稿用紙、A3見開きの履歴書、記入済とブランクを1ptもずらさず出し分ける申込書。同じテンプレートがロケールパックの差し替えだけで繁体字・簡体字・ヒンディー語の領収書にもなります。

| | |
| :---: | :---: |
| [![縦書き小説](/gallery/typography-novel-ja/preview-2.png)](/ja/gallery) | [![履歴書](/gallery/forms-rirekisho-ja/preview-1.png)](/ja/gallery) |

実例は[ギャラリー](/ja/gallery)に並べています。どれもリポジトリ同梱で、CIがバイト単位で出力を照合しています。

## 検証まで、一つのエンジンで

作る・確かめる・配るの全工程が同じエンジンを通ります。署名と検証はCLIの仕事で、ネットワークを使いません。

1. **validate** — 安定した診断コードつきで、レンダリング前に間違いを機械可読に指摘します。
2. **preview** — ページごとのPNG。目で見てから出荷できます。
3. **render** — 同じ入力なら、CLIでもDockerでもSDKでもブラウザでも同じバイト列のPDF。
4. **sign** — 増分更新の電子署名。署名後もPDFとして開けます。
5. **verify** — 署名が実際に覆うバイト範囲を報告し、検証しなかったことも明示します。

進め方は[チュートリアル](/ja/tutorials)に、テンプレートの書き味は[プレイグラウンド](/ja/playground)にあります。

## AIエージェントに全工程を渡す

MCPサーバが同じDockerイメージに入っています。エージェントはYAMLを書き、validateし、プレビューを見て、診断コードに対して修正を繰り返します。このループのためにエンジンを設計しました。詳細は[エージェント](/ja/agents)へ。

## GUIもある。ただし唯一の入口ではない

[Designer](/designer/)は同じエンジンの上のビジュアルエディタで、エージェントと同じファイルを読み書きします。GUIで開いて、YAMLで直して、またGUIで開けます。
