---
layout: home
title: Shojiku
description: "YAMLのテンプレートとJSONのデータから、請求書・領収書・申込書を出す帳票エンジン。同じ入力なら、どのマシンでも同じバイト列のPDFになります。AIエージェントから扱えます。"
hero:
  name: Shojiku
  text: YAMLを書けば、帳票になる。
  tagline: 請求書、領収書、申込書、原稿用紙。テンプレートのYAMLとデータのJSONから、どのマシンでも同じバイト列のPDFを出す帳票エンジンです。
  image:
    src: /brand/hero.png
    alt: Shojikuのヒーローバナー。この画像自体がShojikuのレンダリング出力
  actions:
    - theme: brand
      text: はじめる
      link: /ja/tutorials
    # target forces a full page load: /designer/ is a separate app merged into
    # the deployed output, so VitePress's SPA router must not intercept it.
    - theme: alt
      text: Designerを開く
      link: /designer/
      target: _self
    - theme: alt
      text: GitHub
      link: https://github.com/kengos/shojiku
---

<div class="sj-note">上のバナーは、このサイトが説明しているエンジンそのものの出力です（200mm×90mmのテンプレート1枚。<a href="https://github.com/kengos/shojiku/tree/main/examples/dev/site-hero/">templates.yml</a>）。右の縦書き二列は原稿用紙スタイルの <code>char_grid</code> で、朱印は空白マスの上に置いた <code>ellipse</code> です。</div>

## ライブプレビュー

このページを開いた時点で、WASMのエンジンがブラウザに読み込まれています。下のYAMLを書き換えると、エンジンがその場でレンダリングし直します（※ サーバーには何も送信されません）。

例えば、`store_name`の`fontSize: 14`を`24`に変更してみましょう。店名がその場で大きくなります。日本語の例を試すときは、ボタンを押して日本語フォント（約9MB）を読み込んでください。

今回はブラウザ上で動かしましたが、CLIでもDockerでもSDKでも、同じ入力からは同じバイト列のPDFが出ます。

<ClientOnly><LiveRenderer /></ClientOnly>

## アーキテクチャ

Shojikuのメインの機能は、領収書や、受付票のお客様控えのような帳票の生成です。画面で見せるためではなく、印刷して渡すことを前提にした、業務用の帳票エンジンです。

PythonのSDKではこう書きます。

```python
import shojiku

client = shojiku.Client(
    templates="templates/",        # テンプレート(templates.yml)を置いたディレクトリ
    font_dirs=["packs/fonts"],
    locale_dirs=["packs/locale"],
)
params = {"order": fetch_order(order_id)}  # 帳票に載せる値。DBのデータから組み立てる
result = client.generate("receipt-ja", params)
open("receipt.pdf", "wb").write(result.artifact.bytes)
```

テンプレートの書き方やできる表現は、[リファレンス](https://github.com/kengos/shojiku/blob/main/docs/engine/README.md)（機能ごとに1ページ）と[チュートリアル](/ja/tutorials)を参考にしてください。テンプレート作成をAIに任せるためのスキルは[エージェント](/ja/agents)にあります。

## 署名もできます

領収書のような帳票は、配ったあとに「本当にこのサーバーが出力したものか」が問題になることがあります。多くのPDF生成ライブラリは電子署名に対応していませんが、Shojikuは署名までサポートしています。

```python
provider = shojiku.LocalPem(key="signer.key", cert="signer.crt")
signed = result.artifact.sign(provider)
open("receipt-signed.pdf", "wb").write(signed.artifact.bytes)
```

署名したPDFをストレージに保存しておけば、あとから`verify`で、正しくサーバーから出力されたものであることを電子的に確認できます。

秘密鍵をアプリケーションに置けない場合 — クラウドKMSやHSMで管理している場合 — は、署名を2回の呼び出しに分けられます。署名対象のバイト列をShojikuが渡し、鍵を持っている側がそれに署名し、Shojikuが署名を文書に書き込みます。秘密鍵はPDFを生成するプロセスに入りません。

```ruby
provider = Shojiku::ExternalSigner.new(cert: "signer.crt", algorithm: :ecdsa_p256_sha256) do |to_be_signed|
  kms.sign(key_id: ENV.fetch("KEY_ID"), message: to_be_signed,
           message_type: "RAW", signing_algorithm: "ECDSA_SHA_256").signature
end

signed = result.artifact.sign(provider)
```

KMSのクライアントはShojiku側では持ちません。ブロックの中身は、アプリケーションがすでに使っているクライアントそのものです。この機能は言語SDK7つすべてと、コマンドラインでも使えます。

## 長年要望されていた縦書きにも対応

ほとんどのPDF生成ライブラリでは、縦書きに対応していませんでした。Shojikuは対応しています。縦書きの小説のような見た目も、A3見開きの履歴書も作れます。小売店などでよく見かける申込書や、試験問題のプリントも作れます。数学のテスト向けの数式組版（TeXなど）は準備中です。

こうした帳票も、AIエージェントに頼めばテンプレートから作れます。退屈な帳票作成の仕事は、任せてしまえます。

| | |
| :---: | :---: |
| [![縦書き小説](/gallery/typography-novel-ja/preview-2.png)](/ja/gallery) | [![履歴書](/gallery/forms-rirekisho-ja/preview-1.png)](/ja/gallery) |

その他の出力例は[ギャラリー](/ja/gallery)を確認してみてください。

## AIエージェントでの帳票の作成

テンプレートを自分で書く必要はありません。MCPサーバーとスキルが同梱されているので、AIエージェントにそのまま頼めます。セットアップは2コマンドです（Claude Codeの例。詳細は[クイックスタート](https://github.com/kengos/shojiku/blob/main/docs/quickstart.md)を確認してみてください）。

```bash
claude mcp add shojiku -- \
  docker run --rm -i --entrypoint shojiku-mcp \
  -v "$PWD:/work" -w /work ghcr.io/kengos/shojiku:edge
```

```bash
npx skills add kengos/shojiku
```

あとは頼むだけです。

> 受付票のテンプレートを作って。上に店名、真ん中に予約番号とQRコード、下に注文の明細表。

エージェントがYAMLを書き、MCPサーバーで検証し、プレビューを確認し、診断が消えるまで直します。これで簡単にPDFが作れます。詳細は[エージェント](/ja/agents)を確認してみてください。

## GUIでの細かい修正も可能

AIが出力したテンプレートで気に入らないところを、人間が手で直すためのGUIも用意しました。使い方は、<a href="/designer/" target="_self">Designer</a>をブラウザで開いて`templates.yml`を読み込み、キャンバス上で位置やスタイルを修正するだけです。

![Designerで見積書テンプレートを開き、合計金額のテキストを選択して編集しているところ](/media/designer-editor.png)
