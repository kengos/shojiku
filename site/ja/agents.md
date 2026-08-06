---
title: エージェント
description: "テンプレートはYAMLとJSON、エラーは安定した診断コード、レイアウトはツリーで読み返せます。MCPサーバを登録して、エージェントに書かせて確かめさせるまで。"
---

# AIエージェントでテンプレートを作る

Shojikuのテンプレートは、AIエージェントが読み書きできるように設計されています。文書はYAMLとJSONのテキストです。エラーには安定した診断コードが付き、レイアウトの結果はツリーとして読み返せます。だからエージェントは、書いて確かめるサイクルを自分で回せます。

## MCPサーバを登録する

`shojiku-mcp`は、`validate` / `render_preview` / `inspect_layout` / `capabilities` に加えて、同梱サンプルを読むための `list_examples` / `get_example` を持つstdioサーバで、CLIと同じDockerイメージに入っています。Claude Codeでは、次のコマンドで登録できます。

```bash
claude mcp add shojiku -- \
  docker run --rm -i --entrypoint shojiku-mcp \
  -v "$PWD:/work" -w /work ghcr.io/kengos/shojiku:edge
```

他のクライアントでも、設定ファイルに同じコマンドをJSON形式で書けば登録できます。違うのは、設定ファイルの場所と書き方だけです。詳細は[クイックスタートのMCP節](https://github.com/kengos/shojiku/blob/main/docs/quickstart.md)を確認してみてください。

## スキルを入れる

テンプレート作成、スキーマからの定義生成、レンダリングデバッグ、Thinreports移行の4つのスキルをリポジトリに同梱しています。

```bash
npx skills add kengos/shojiku
```

中心になるのは`shojiku-template-author`です。要件からテンプレートを書き、validateし、プレビュー画像を実際に確認して、診断がきれいになるまで反復します。この手順の全体と、リファレンスには載せていない注意点を、スキルの中にまとめてあります。`shojiku-definitions-author`は、その前の工程を受け持ちます。データベースのスキーマやORMのモデル、APIのレスポンスを渡すと、`definitions.yml`と、実データからparamsを組み立てるコードを作り、対応付けの正しさをエンジンの`params_*`診断で確認します。

## エージェントが回すループ

1. `list_examples` — 目的に一番近い同梱サンプルを探し、`get_example`でそのソースを読む
2. `definitions.yml`にデータ項目を宣言する
3. `templates.yml`を書く
4. `validate` — 間違いが診断コードで返る
5. `render_preview` — ページのPNGを確認する
6. `inspect_layout` — 確定したレイアウトを読み返す
7. 診断がきれいになるまで3に戻る

このサイトの[ヒーローバナー](/ja/)も、このループで作られました。

## ページをAIに渡す

このサイトの各ページには`.md`のプレーンテキスト版があります。[/llms.txt](/llms.txt)が目次で、[/llms-full.txt](/llms-full.txt)には、リファレンスの索引と診断コードの一覧まで入っています。エージェントにShojikuを教えるときは、このURLを渡すだけで済みます。
