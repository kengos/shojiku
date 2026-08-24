// The course's Japanese copy, keyed by step id. Deliberately NOT part of the
// chrome catalog: the catalog's parity gate demands every key in all six
// languages, and machine-translating instructional prose is worse than falling
// back to the one other language a maintainer actually reviews.
//
// Copy discipline (validated with a zero-context reader): define each term
// where it first appears, no programmer vocabulary, units noted once, and
// automatic behavior is DEMONSTRATED by a step rather than asserted.
//
// The Japanese follows the house prose standard: no em-dash and no 中黒 in
// running text (split the sentence, or use 読点 / 括弧), full-width parentheses,
// the reader is never addressed as 「あなた」, and the app is not personified as
// 「道具」 — a position the reader does not set is simply 自動で決まる.
//
// Every string renders as React text. Braces are ordinary characters here (the
// copy is never run through the ICU formatter), which is what lets a step show
// binding syntax like {total} verbatim.

/** Chapter headings, shown in the launcher and above the coach mark. */
export const CHAPTER_TITLES_JA: Record<string, string> = {
  ch0: '白紙とページ設定',
  ch1: 'タイトルと文字の修飾',
  ch2: 'コンテナでヘッダーを組む',
  ch3: 'データ項目を作ってつなぐ',
  ch4: '明細テーブル',
  ch5: '合計行',
  ch6: 'フッターとページ番号',
  ch7: '社判を固定配置',
  ch8: '仕上げと書き出し',
};

export const COPY_JA: Record<string, string> = {
  'ch0.blank': '練習用の白紙を開きました。ここで何をしても、開いていた文書には影響しません。',
  'ch0.pageSize':
    '右の「文書設定を開く」を押すと、紙面全体の設定が開きます。「ページ設定」で用紙が A4 の縦向きになっていることを確認します。',
  'ch0.margin':
    '同じ画面の「余白」を 24 にします。長さの単位は pt で、1pt はおよそ 0.35mm、A4 は 595 × 842pt です。',
  'ch1.insertText': '「挿入」→「テキスト」で、文字の箱をひとつ置きます。',
  'ch1.type': '置いた箱をダブルクリックして「御請求書」と入力します。',
  'ch1.bold': '上の書式バーで「太字」にします。',
  'ch1.size': '「サイズ」を 21 にします。',
  'ch1.align': '「文字配置」で「中央揃え」にします。',
  'ch1.style':
    'この見た目に名前を付けて使い回せます。書式バーの「スタイル」→「選択の書式をスタイルに登録…」で、「タイトル」という名前で登録します。',
  'ch2.openPicker':
    '複数の要素を並べる入れ物を「コンテナ」と呼びます。「挿入」→「コンテナ…」を開きます。',
  'ch2.pick':
    '格子の 3列×1行 の位置をクリックします。3つの区画（スロット）が横に並んだコンテナができます。',
  'ch2.left': '左のスロットをダブルクリックし「株式会社サンプル商事 御中」と入力します。',
  'ch2.rest': '同じように、中央へ「請求日: 」、右へ「No. 」を入れます。',
  'ch2.gap':
    'スロットを選ぶと、右パネルの上に「親コンテナ」カードが現れます。その「間隔」（スロットのあいだの空き）を 8 にします。',
  'ch2.ratio':
    '「比率」を左:中:右の順で 1:2:1 にします。数字は各スロットが取る横幅の割合で、真ん中が2倍の幅になります。',
  'ch2.auto':
    '配置タブの X/Y が薄い字で「自動」と出ています。位置は自動で決まるので、数字を指定する必要はありません。数字で決めるのは、第6章のフッターと第7章の社判だけです。',
  'ch3.openField':
    '発行のたびに変わる値（宛名、日付、金額）は「データ項目」にします。「挿入」→「データ項目を作成…」を開きます。',
  'ch3.create':
    '「customer」という名前で、テキストのデータ項目をひとつ作ります。項目名は半角の英字にします。文の途中に差し込むとき、日本語の項目名は使えないためです。',
  'ch3.dataTab': '左の「データ項目」タブを開きます。いま作った項目が並んでいます。',
  'ch3.bind': '「customer」を紙面へドラッグします。文字がサンプルの値に変わります。',
  'ch3.chip':
    '「請求日: 」の文中に「date」をドラッグします。こうして文の途中に埋め込んだ値を「チップ」と呼びます。',
  'ch3.sample':
    '「データ項目」タブの歯車ボタンから編集画面を開き、宛名の値を書き換えます。紙面がすぐ追従します。',
  'ch3.format':
    '金額の「フォーマット」で symbol を選びます。¥300,000 のように通貨記号で出ます（name なら「日本円」のように通貨名で出ます）。値は数値のまま保たれ、見せ方だけが変わります。',
  'ch4.openIterable':
    '明細のように行数が毎回変わるくり返しのデータは「一覧データ」で置きます。「挿入」→「一覧データを置く…」を選びます。',
  'ch4.create':
    '「items」という名前で、品名（name）、数量（qty）、単価（price）、金額（amount）を持つ一覧を作ります。「見せ方」は表、カード、リストから選べます。ここでは「表」にします。',
  'ch4.drawn': 'サンプルの行数ぶん表が描かれ、いちばん上に見出しの行（ヘッダー行）が付きました。',
  'ch4.width': '右の「列」で、金額列の「列幅」を 90 にします。',
  'ch4.alignRight':
    '数量、単価、金額の列を、1列ずつ選んで右揃えにします。数字は右揃えにすると読みやすくなります。',
  'ch4.paginate':
    'データ項目の編集画面で、明細（items）の行を増やします。1ページに収まらなくなると、紙面の下に2ページ目が現れて続き、見出し行も繰り返されます。',
  'ch5.container': '第2章と同じ手順で、表の下に 2列×1行 のコンテナを置きます。',
  'ch5.total':
    '右のスロットに「合計 」と入力し、第3章と同じように「total」をドラッグしてチップを差し込みます。',
  'ch5.ratio': '比率を 3:1 にします。右のスロットが幅1/4になり、合計が右端に寄ります。',
  'ch5.bold':
    '合計の文字を太字にします。一回きりの指定なら、スタイルに登録せず直接指定してかまいません。',
  'ch6.createFooter':
    'どのページにも同じ位置に印刷される帯を、下端なら「フッター」、上端なら「ヘッダー」と呼びます。左の「構成」タブ（文書の要素の一覧）に、まだ中身のない「フッター」の行があります。押すと作られます。',
  'ch6.insertText': '「挿入」→「テキスト」で社名を置きます。',
  'ch6.place':
    '帯の中は毎ページ同じ場所に刷るため、位置を数字で決めます。X を 24、Y を 762 にします。余白の内側は上から 794pt なので、762 は下端の少し手前です。',
  'ch6.pageNumber':
    '「挿入」→「ページ番号」を置きます。印刷のとき「1 / 3」のように自動で埋まります。',
  'ch6.everyPage': 'どのページにも同じフッターが出ていることを確かめます。',
  'ch7.image': '「挿入」→「画像を配置…」で社判の画像を選びます。',
  'ch7.pin':
    '配置タブで「固定」を押します。見た目はそのままで、以後この画像は他の要素が増減しても動かなくなります（「自動」を押せばいつでも元の並びに戻せます）。',
  'ch7.move':
    'X 480 / Y 40 にします。紙面をドラッグしても動かせます。ずれても取り消し（⌘Z / Ctrl+Z）でいつでも戻せます。',
  'ch8.diagnostics':
    '画面下の警告一覧（診断）が空になっているか確認します。問題があればここに日本語で表示され、クリックで該当箇所に飛べます。',
  'ch8.sample':
    'データ項目の編集画面でサンプルデータを一度差し替えて、全体が追従することを確認します。',
  'ch8.export':
    '「ファイル」→「書き出す…」で、テンプレート（templates.yml）とサンプルデータを書き出します。ここまで GUI で組んだものが、そのまま読める YAML のファイルです。PDF が要るときは「PDF形式でダウンロード…」です。',
  'ch8.done':
    'これで完成です。作った請求書は、自分のテンプレートの出発点として使えます。お疲れさまでした。',
  // Topic-specific steps (the reused steps show their course sentence via copyId).
  'topic-footer.select':
    'どのページにも同じ位置に印刷される帯を、下端なら「フッター」、上端なら「ヘッダー」と呼びます。左の「構成」タブ（文書の要素の一覧）でフッターを選択します。',
  'topic-containers.grid':
    '格子の 3列×2行 の位置をクリックします。6つの区画（スロット）が並んだ、表組みのコンテナができます。',
  'topic-containers.columns': '右パネルの「列」を 4 にします。区画が横にひとつ増えます。',
  'topic-containers.nest':
    'スロットを選んだまま「挿入」→「コンテナ…」を選ぶと、その区画の中に入れ子で追加されます（挿入先が予告されます）。',
  'topic-binding.dataTab': '左の「データ項目」タブで、この文書が使うデータ項目を確認します。',
  'topic-binding.rebind':
    '宛名の欄をクリックし、右パネルの「データ項目」でひもづけ先を別の項目に付け替えます。',
  'topic-binding.rechip':
    '「請求日: {date}」のチップを一度消し、もう一度「date」をドラッグで差し込み直します。文の途中のチップは付け外しできます。',
  'topic-table.paste':
    'Excel に表があるなら「挿入」→「表を貼り付け…」が近道です。コピーしたセルから列の構成を推測して表を作ります。',
  'topic-placement.explain':
    'この文書のヘッダーは「コンテナ」の中に3つのテキストが並んでいます。中の要素の位置は自動で決まります（配置タブの X/Y が薄い字で「自動」）。',
  'topic-placement.pin':
    '左のテキストを選び、配置タブで「固定」を押します。見た目はそのままで、以後この要素は他が増減しても動かなくなります。',
  'topic-placement.move':
    'X/Y の数字を変えると、固定した要素だけが動きます。紙面をドラッグしても動かせます。ずれても取り消し（⌘Z / Ctrl+Z）で戻せます。',
  'topic-placement.unpin':
    'もう一度「自動」を押すと固定が解除され、元の並びに戻ります（再フロー）。位置は自動で計算し直されます。',
  'topic-style.origin':
    '「御請求書」をクリックし、右パネルの「装飾」タブを開きます。自分の値を持たない項目には、実効値とその出どころ（スタイル「タイトル」由来、親要素から継承、文書の既定値由来）を示す行が付きます。',
  'topic-style.update':
    'まず「タイトル」スタイル自体を更新します。タイトルのサイズを変えてから、書式バーの「スタイル」→「「タイトル」を選択に合わせて更新…」を選ぶと、変えた書式がスタイルに移り、そのスタイルを使っている箇所がまとめて追従します。',
  'topic-style.override':
    '次にタイトルを選び、書式バーでサイズを直接変えます。由来が「スタイル」から「この要素」に変わり、以後この要素はスタイルに追従しません。上書きが効くのは、この要素だけです。',
};

/** Topic titles (shown in the launcher), keyed by topic/chapter id. */
export const TOPIC_TITLES_JA: Record<string, string> = {
  'topic-containers': 'コンテナと並べ方',
  'topic-binding': 'データ連携',
  'topic-table': '表（一覧データ）',
  'topic-footer': 'フッターとページ番号',
  'topic-placement': '固定配置と自動配置',
  'topic-style': 'スタイルと書式の由来',
};

/** One-line topic subtitles for the launcher, keyed by topic id. */
export const TOPIC_SUBTITLES_JA: Record<string, string> = {
  'topic-containers': '縦積み、表組み、入れ子、スロット追加',
  'topic-binding': 'ひもづけ先の変更、チップ挿入',
  'topic-table': 'Excel から表を貼り付け',
  'topic-footer': 'ヘッダー帯、ページ番号',
  'topic-placement': '固定と自動を切り替えて再フロー',
  'topic-style': '由来バッジの見分け、スタイル一括更新',
};

/** Launcher section headers + the trust-note intro. */
export const LAUNCHER_JA = {
  sectionCourse: '通しコース',
  sectionTopics: 'トピック（個別練習、2〜3分）',
  intro:
    '通しコースで全体の流れを、トピックで個別の操作を練習できます。どちらも練習用の文書で試すので、作業中の文書は変わりません。',
};
