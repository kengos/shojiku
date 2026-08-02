---
title: エージェント
---

# AIエージェントに全工程を渡す

Shojikuのテンプレートは、エージェントが読める・書ける・確かめられるように設計されています。エージェントの仕事の仕方はテキストの読み書きです。だから文書は二枚のYAMLで、エラーは安定した診断コードで、レイアウトはツリーとして読み返せます。

## MCPサーバを登録する

`shojiku-mcp` は `validate` / `render_preview` / `inspect_layout` / `capabilities` を持つstdioサーバで、CLIと同じDockerイメージに入っています。Claude Codeなら：

```bash
claude mcp add shojiku -- \
  docker run --rm -i --entrypoint shojiku-mcp \
  -v "$PWD:/work" -w /work ghcr.io/kengos/shojiku:edge
```

他のクライアントには同じコマンドをJSONで渡します。設定ファイルの場所とマウントの綴りだけが違います。詳細は[クイックスタートのMCP節](https://github.com/kengos/shojiku/blob/main/docs/quickstart.md)へ。

## スキルを入れる

テンプレート作成・スキーマからの定義生成・レンダリングデバッグ・Thinreports移行の4つのスキルがリポジトリに同梱されています。

```bash
npx skills add kengos/shojiku
```

`shojiku-template-author` が本体です。要件からテンプレートを書き、validateし、プレビューの画像を実際に見て、診断がきれいになるまで反復する。その全手順と、リファレンスに書ききれない罠の一覧を持っています。`shojiku-definitions-author` はその一歩手前を受け持ちます。データベースのスキーマやORMモデル、APIのレスポンスを渡すと、`definitions.yml` と実データからparamsを組み立てるコードを導出し、エンジンの `params_*` 診断で対応付けの正しさを証明します。

## エージェントが回すループ

1. `definitions.yml` にデータ項目を宣言する
2. `templates.yml` を書く
3. `validate` — 診断コードで機械可読に失敗する
4. `render_preview` — ページのPNGを見る
5. `inspect_layout` — 解決済みジオメトリを読み返す
6. きれいになるまで2に戻る

このサイトの[ヒーローバナー](/ja/)も、このループで作られました。

## ページをAIに渡す

このサイトの各ページには `.md` の生テキストがあり、[/llms.txt](/llms.txt) が地図、[/llms-full.txt](/llms-full.txt) がリファレンスの索引と診断コード一覧を含む全文です。エージェントにShojikuを教えるときは、URLを一つ渡せば足ります。
