---
layout: home
title: Shojiku
description: "YAMLのテンプレートとJSONのデータから請求書・領収書・申込書のPDFを出すRust製の帳票エンジン。Python、Go、Rubyなど7言語から呼べます。マルチテナントのSaaSでは、テナントごとのテンプレートを差し替えるだけで体裁を変えられます。"
hero:
  tagline: 請求書、領収書、申込書、原稿用紙。YAMLのテンプレートとJSONのデータからPDFを出力するRust製のエンジンです。
  actions:
    - theme: brand
      text: チュートリアル
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
features:
  - title: どの言語からでも
    details: Python、Node.js、Ruby、C#、Java、Go、PHP（Packagistへの登録は準備中）。Rustで書いたエンジン1つを、7言語のSDKが同じように呼びます。エンジンをRustで書いて各言語から呼ぶ形にしたのは、JavaScript製のライブラリをRailsから使えずに諦めたからです。
  - title: どの環境でも同じPDF
    details: ブラウザもヘッドレスChromeも使いません。CLIでもDockerでもブラウザ上のWASMでも、同じテンプレートと同じデータからは、ハッシュ値まで一致するPDFが出ます。
  - title: HTMLのように積む
    details: 本文は上から順に積まれ、枠は内容に合わせて伸びます。余白を1箇所直してもフォントを大きくしても、下の要素の位置はエンジンが計算し直します。flexもgridも、CSSと同じ名前で書けます。
  - title: AIエージェントが書く
    details: MCPサーバーとスキルを同梱。テンプレートのYAMLはエージェントに書かせ、診断が消えるまで直させます。
  - title: マルチテナントのSaaSに
    details: テナントごとにtemplates.ymlを持たせれば、同じコードのままテナント別の請求書や領収書を出せます。差分はYAMLに閉じ込められるので、アプリケーションのコードもデプロイも増えません。
---


## ライブプレビュー

このページを開いた時点で、WASMのエンジンがブラウザに読み込まれています。下のYAMLを書き換えると、入力が止まるとレンダリングし直します（※ サーバーには何も送信されません）。

いじる場所は3つだけです。`page`の`margin: 24`を`40`にすればページ全体が動き、`defaults`の`fontSize: 10`を`13`にすれば下の行が全部大きくなり、カードの`padding: 12`を`24`にすれば表の周りだけ空きます。どれも1箇所で、下の要素の位置はエンジンが計算し直します。

日本語の例を試すときは、ボタンを押して日本語フォント（約9MB）を読み込んでください。ブラウザ上で動かしていますが、CLIでもDockerでもSDKでも、同じ入力からは同じPDFが出ます。

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

## マルチテナントのSaaSで帳票を出す

テナントごとに請求書や領収書の体裁が違う、というのはSaaSでは普通の要件です。Shojikuでは、その差分をテンプレートのYAMLに閉じ込められます。テナントごとの`templates.yml`をストレージに置き、生成のときにどれを読むかを選ぶだけです。アプリケーションのコードは1つのまま、Rust製のエンジンをPython、Go、Ruby、Java、C#、PHP、Node.jsのどれからでも同じように呼びます。

テンプレートが参照できるデータ項目は`definitions.yml`が台帳になっています。テナント側で書き換えたテンプレートが存在しないキーを参照していれば、PDFを生成する前に診断で止まります。

テナントの担当者に体裁を触らせたい場合は、Designerを自分たちのシステムの下にマウントできます。静的ビルドを`/admin/designer/`のような自社のパスで配信し、認証は手前のリバースプロキシで済ませ、保存は自社のAPIへ流します。Shojikuは認証コードを持たず、何もホストしません（[マウント手順](https://github.com/kengos/shojiku/blob/main/docs/designer-mount.md)）。

## 署名もできます

領収書のような帳票は、配ったあとに「本当にこのサーバーが出力したものか」が問題になることがあります。多くのPDF生成ライブラリは電子署名に対応していませんが、Shojikuは署名までサポートしています。

```python
provider = shojiku.LocalPem(key="signer.key", cert="signer.crt")
signed = result.artifact.sign(provider)
open("receipt-signed.pdf", "wb").write(signed.artifact.bytes)
```

署名したPDFをストレージ（S3やCloud Storage）に保存しておくことで、あとから正しくサーバーから出力されたものであることを確認できます。

秘密鍵の管理をクラウドKMSやHSMで行うこともできます。

```python
# 秘密鍵はShojikuのエンジンに渡りません。エンジンは署名対象のバイト列を渡すだけで、
# 署名して返すのは、アプリケーションがすでに使っているKMSのクライアントです。
provider = shojiku.ExternalSigner(
    lambda to_be_signed: kms.sign(
        KeyId=os.environ["KEY_ID"],
        Message=to_be_signed,
        MessageType="RAW",
        SigningAlgorithm="ECDSA_SHA_256",
    )["Signature"],
    cert="signer.crt",
    algorithm=shojiku.Algorithm.ECDSA_P256_SHA256,
)
signed = result.artifact.sign(provider)
```

この機能はすべてのSDKとCLIで、同じ書き方で使えます。

## ちょっと変わった使い方も

縦書きや、履歴書のような書式も作れます。どちらにも対応していない帳票エンジンがほとんどです。下の2枚は、AIエージェントに依頼してShojikuでレンダリングしたものです。

| | |
| :---: | :---: |
| [![縦書き小説](/gallery/typography-novel-ja/preview-2.png)](/ja/gallery) | [![履歴書](/gallery/forms-rirekisho-ja/preview-1.png)](/ja/gallery) |

その他の出力例は[ギャラリー](/ja/gallery)を確認してみてください。

エンジンに組み込まれている言語は日本語と英語だけですが、繁体字と簡体字の中国語、ヒンディー語、フィリピン語、タイ語はロケールパックというファイルで足せます。
通貨も日付も桁区切りもフォントもそのファイルが決めるので、テンプレートは1つのまま使い回せます。
[組み込み以外の言語](/ja/languages)にまとめました。

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

エージェントがYAMLを書き、MCPサーバーで検証し、プレビューを確認し、診断が消えるまで直します。詳細は[エージェント](/ja/agents)を確認してみてください。

## GUIでの細かい修正も可能

AIが出力したテンプレートで気に入らないところを、人間が手で直すためのGUIも用意しました。使い方は、<a href="/designer/" target="_self">Designer</a>をブラウザで開いて`templates.yml`を読み込み、キャンバス上で位置やスタイルを修正するだけです。

![Designerで見積書テンプレートを開き、合計金額のテキストを選択して編集しているところ](/media/designer-editor.png)
