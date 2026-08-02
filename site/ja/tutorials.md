---
title: チュートリアル
---

# チュートリアル — 最初の1枚から本番リリースまで

このページは、PDFを1枚出すところから、テンプレートをDockerイメージに梱包して本番に載せるところまでを一直線に進みます。コマンドは全部、CIで実際に実行されているものの転記です。

## 1. まず1枚出す（Docker）

イメージにはCLI・MCPサーバ・フォント/ロケールパック・全同梱例が入っています。

```bash
docker run --rm ghcr.io/kengos/shojiku:edge > receipt.pdf
```

テンプレートを手元に取り出して編集し、プレビューを見る手順は[クイックスタート](https://github.com/kengos/shojiku/blob/main/docs/quickstart.md)にあります。編集→検証→プレビューのループはそちらが本編です。

## 2. アプリに組み込む（公開レジストリのSDK）

5言語のパッケージが公開済みです。どのSDKも同じ形をしています：クライアントを作り、テンプレート名とパラメータを渡し、返ってきたバイト列を書き出す。エラーは例外ではなく、`failure` の種別とメッセージで返ります。

::: code-group

```bash [Python]
pip install shojiku
```

```bash [Ruby]
gem install shojiku
```

```bash [Node]
npm install shojiku
```

```bash [.NET]
dotnet add package Shojiku
```

```xml [Java]
<!-- 本体 + 実行プラットフォームのclassifier（Netty/LWJGLと同じ流儀） -->
<dependency>
  <groupId>jp.kengos</groupId>
  <artifactId>shojiku</artifactId>
  <version>0.1.0</version>
</dependency>
<dependency>
  <groupId>jp.kengos</groupId>
  <artifactId>shojiku</artifactId>
  <version>0.1.0</version>
  <classifier>linux-x64</classifier>
</dependency>
```

:::

レンダリングは全言語で同じ3行です。Pythonなら：

```python
import json, shojiku

client = shojiku.Client(
    templates="templates/", font_dirs=["packs/fonts"], locale_dirs=["packs/locale"]
)
result = client.generate("receipt-ja", json.load(open("params.json")))
if not result.success:
    raise SystemExit(f"{result.failure.kind} | {result.failure.message}")
open("out.pdf", "wb").write(result.artifact.bytes)
```

フォントとロケールのパックはリポジトリの `packs/` をアプリに同梱します。使うロケールのパックだけに絞って構いません。

## 3. ロゴ画像と自社フォントを足す

実務のテンプレートで最初に必要になるのは、この二つです。

**画像**はテンプレートの隣に置いて `src` で参照します。基準ディレクトリはテンプレートファイルのある場所（CLIなら `--assets-dir` で変更可）で、`data:` URIやインラインSVG、paramsから差し込む動的画像も使えます。正確な仕様は[image.md](https://github.com/kengos/shojiku/blob/main/docs/engine/image.md)へ。

```yaml
- type: image
  box: { w: 120, h: 40 }
  src: assets/logo.svg
```

**フォント**はパックです。フォントファイルと `manifest.yml`（ライセンス1つ + 顔ごとのsha256）を `packs/fonts/<id>/` に置き、ロケールのオーバーレイで `uses` に足します。読み込み時にsha256と埋め込み権利（fsType）が検証されます。正確な仕様は[fonts.md](https://github.com/kengos/shojiku/blob/main/docs/engine/fonts.md)へ。

```yaml
# packs/fonts/my-corporate/manifest.yml
version: 1
license: Proprietary
redistributable: false
faces:
  - id: my-corporate
    file: MyCorporate-Regular.ttf
    sha256: <sha256sum の出力>
```

```yaml
# packs/locale/ja-jp.yml（ビルトインja-JPへのオーバーレイ）
fonts:
  uses: [biz-ud, ipamj-mincho, noto-sans-mono, my-corporate]
```

これで `fontFamily: my-corporate` が使えます。`uses` は全体を書き直す点（追記ではない）と、ロケールが `uses` していないパックの `fontFamily` は黙ってフォールバックする点に注意。下のDockerfileレシピは `packs/` を丸ごとCOPYするので、自作パックも同じ行に乗ります。

## 4. 本番に載せる（Dockerfileレシピ）

テンプレートができたら、アプリ・テンプレート・パックを1つのイメージに焼き込みます。以下は5言語ぶんの実レシピで、`make proof-deploy` が公開レジストリに対して実際にビルド＆レンダリングして検証しているファイルそのものです。

::: code-group

<<< ../../examples/deploy/python/Dockerfile{docker} [Python]

<<< ../../examples/deploy/ruby/Dockerfile{docker} [Ruby]

<<< ../../examples/deploy/node/Dockerfile{docker} [Node]

<<< ../../examples/deploy/dotnet/Dockerfile{docker} [.NET]

<<< ../../examples/deploy/java/Dockerfile{docker} [Java]

:::

Pythonのレシピは一歩進めて、paramsをイメージ内のSQLiteから引いています。静的な事実（発行者ブロックやQR）はテンプレート側のparamsに置き、取引の行だけをDBから合成する形です：

<<< ../../examples/deploy/python/render.py{python}

## 5. 署名して、検証する

配る前に署名し、受け取った側が検証します。どちらもネットワークを使いません。パスフレーズを引数で渡すフラグは意図的にありません（`argv` は他プロセスから読めるため）。

```bash
shojiku sign --input out.pdf --key signer.pem --cert signer.crt --output signed.pdf
shojiku verify --input signed.pdf --anchor signer.crt
```

`verify` は署名が実際に覆うバイト範囲を含むJSONレポートを出力し、文書が検証できなければ非ゼロで終了します。信頼するcertは `--anchor` で毎回明示します。マシンの証明書ストアは参照しません。

## 次へ

- テンプレートの書き方そのものは[リファレンス](https://github.com/kengos/shojiku/blob/main/docs/engine/README.md)（32ページ、機能ごとに1ページ）
- 触って確かめるなら[プレイグラウンド](/ja/playground)
- 書くのをAIに任せるなら[エージェント](/ja/agents)
