---
title: チュートリアル
description: "PDFを1枚出すところから、テンプレートをDockerイメージに梱包して本番に載せるまで。コマンドはCIで実際に走っているものの転記です。"
---

# チュートリアル — 最初の1枚から本番リリースまで

このページでは、PDFを1枚出すところから、テンプレートをDockerイメージに梱包して本番に載せるところまでを、順に進みます。コマンドは全部、CIで実際に実行されているものの転記です。

## 1. まず1枚出す（Docker）

イメージにはCLI、MCPサーバ、フォントとロケールのパック、そしてすべての例が入っています。

```bash
docker run --rm ghcr.io/kengos/shojiku:edge > receipt.pdf
```

テンプレートをローカルに取り出して編集し、プレビューを見る手順は[クイックスタート](https://github.com/kengos/shojiku/blob/main/docs/quickstart.md)にあります。編集→検証→プレビューのループはそちらが本編です。

## 2. アプリに組み込む（公開レジストリのSDK）

5言語のパッケージが公開済みです。どのSDKも形は同じで、クライアントを作り、テンプレート名とパラメータを渡し、返ってきたバイト列を書き出します。エラーは例外ではなく、`failure` の種別とメッセージで返ります。

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
  <version>0.2.0</version>
</dependency>
<dependency>
  <groupId>jp.kengos</groupId>
  <artifactId>shojiku</artifactId>
  <version>0.2.0</version>
  <classifier>linux-x64</classifier>
</dependency>
```

:::

レンダリングは全言語で同じ3行です。Pythonではこう書きます。

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

フォントとロケールのパックは、テンプレートと同じくアプリに同梱してください。一式はリリースの tarball から取るのが手軽で、使わないロケールのパックは消して構いません。

```bash
wget https://github.com/kengos/shojiku/releases/download/v0.2.0/shojiku-0.2.0-packs.tar.gz
tar xzf shojiku-0.2.0-packs.tar.gz   # packs/fonts と packs/locale が出てくる
```

## 3. 自前の画像を使う

ロゴなど、自前の画像をテンプレートに入れたい場合です。画像ファイルは、テンプレートファイルの隣の `assets/` に置きます。

```
templates/
  receipt-ja/
    templates.yml
    assets/
      logo.png
```

このように配置すると、テンプレートから相対パスで参照するだけで描画されます。画像のバイト列を渡す手続きはありません。

```yaml
- type: image
  box: { w: 120, h: 40 }
  src: assets/logo.png
```

パスの基準はテンプレートファイルのあるディレクトリで、CLIでは `--assets-dir` で変えられます。`data:` URIやインラインSVG、paramsから差し込む動的画像も使えます。正確な仕様は[image.md](/ja/reference/image)にあります。

## 4. 同梱パック以外のフォントを使う

<a href="/designer/" target="_self">Designer</a>のフォントピッカーで選んだ書体や、自社のコーポレートフォントを使いたい場合です。テンプレート側の指定は `style` の `fontFamily` です。

```yaml
# templates.yml — コンテナに書けば、下の要素に継承されます
style: { fontFamily: my-corporate }
```

この`my-corporate`をエンジンに解決させるには、フォントパックを置き、それをロケールに登録します。

**Designerで選んだ場合**は、エクスポートキット（zip）にパック一式がライセンスファイルごと入っています。`packs/fonts/` に展開すれば、パックの用意は終わりです。

**手元にTTFがある場合**は、コマンド1つでパックができます。

```bash
shojiku font add MyCorporate-Regular.ttf \
  --family my-corporate --license Proprietary
# 同じファミリーにボールドを足す
shojiku font add MyCorporate-Bold.ttf \
  --family my-corporate --license Proprietary --weight bold
```

`packs/fonts/my-corporate/` を作り、フォントファイルをコピーし、その sha256 を書き込んだ `manifest.yml` を生成します。

```yaml
# packs/fonts/my-corporate/manifest.yml
version: 1
license: Proprietary
faces:
  - id: my-corporate
    file: MyCorporate-Regular.ttf
    sha256: <自動で計算されます>
```

読み込み時には sha256 と埋め込み権利（fsType）が検証されますが、`font add` も同じ2つを先に確認します。埋め込みが許可されていないフォントは、最初のレンダリング時ではなくこの時点で弾かれます。別途埋め込みライセンスを持っている場合は `--embedding-attested` で明示します。パックは既定では再配布不可で、`--redistributable` を渡したときだけ再配布可になります。

どちらの場合も、最後にどのパックをロードするかをレンダリングに伝えます。1回のレンダリングならフラグで済みます。

```bash
shojiku render --templates templates.yml --params params.json \
  --output out.pdf --font-pack my-corporate
```

毎回のレンダリングで使うデプロイなら、ロケールの `uses` に入れます。オーバーレイファイルを1枚置くだけです。

```yaml
# packs/locale/ja-jp.yml（ビルトインja-JPへのオーバーレイ）
fonts:
  uses: [biz-ud, ipamj-mincho, noto-sans-mono, my-corporate]
```

`uses` は追記ではなく全体の書き直しなので、同梱パックを並べたまま自分のパックを足します。1回だけなら `--font-pack` のほうが短いのは、こちらが置き換えではなく追加だからです。ロケールが `uses` しておらず、実行時にも指定していないパックのフォントを `fontFamily` に指定すると、`unknown_font_family` の警告が出て、ロケール既定のフォントにフォールバックします。

パックの探し方はCLIもSDKも同じで、明示指定、環境変数、カレントの `./packs/fonts` と `./packs/locale` のすべてから探します。同じidがぶつかったときは、明示指定が優先されます。SDKでの明示指定はクライアントのオプションです（セクション2のPythonの例で渡していた `font_dirs` / `locale_dirs` がそれです）。環境変数は `SHOJIKU_FONT_DIR` / `SHOJIKU_LOCALE_DIR`（PATH区切り）、CLIのフラグは `--font-dir` / `--locale-dir` です。次のセクションのDockerfileは `packs/` を丸ごとCOPYするので、自作パックも一緒に含まれます。正確な仕様（`url:` による自動フェッチ、フォールバックチェーンなど）は[fonts.md](/ja/reference/fonts)にあります。

## 5. 本番に載せる（Dockerfileレシピ）

テンプレートができたら、アプリとテンプレートとパックを1つのイメージに焼き込みます。以下は5言語ぶんの実レシピで、`make proof:deploy` が公開レジストリに対して実際にビルド＆レンダリングして検証しているファイルそのものです。

::: code-group

<<< ../../examples/deploy/python/Dockerfile{docker} [Python]

<<< ../../examples/deploy/ruby/Dockerfile{docker} [Ruby]

<<< ../../examples/deploy/node/Dockerfile{docker} [Node]

<<< ../../examples/deploy/dotnet/Dockerfile{docker} [.NET]

<<< ../../examples/deploy/java/Dockerfile{docker} [Java]

:::

Pythonのレシピは一歩進めて、paramsをイメージ内のSQLiteから引いています。静的な事実（発行者ブロックやQR）はテンプレート側のparamsに置き、取引の行だけをDBから合成する形です。

<<< ../../examples/deploy/python/render.py{python}

## 6. 署名して、検証する

配る前に署名し、受け取った側が検証します。どちらもネットワークを使いません。パスフレーズを引数で渡すフラグは意図的にありません（`argv` は他プロセスから読めるため）。

```bash
shojiku sign --input out.pdf --key signer.pem --cert signer.crt --output signed.pdf
shojiku verify --input signed.pdf --anchor signer.crt
```

`verify` は署名が実際に覆うバイト範囲を含むJSONレポートを出力し、文書が検証できなければ非ゼロで終了します。信頼するcertは `--anchor` で毎回明示します。マシンの証明書ストアは参照しません。

## 次へ

- テンプレートの書き方そのものは[リファレンス](/ja/reference/)（31ページ、機能ごとに1ページ）
- 触って確かめるなら[プレイグラウンド](/ja/playground)
- 書くのをAIに任せるなら[エージェント](/ja/agents)
