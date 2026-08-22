// The app extends the Designer's message catalog with its own shell chrome
// (catalog view, toolbar, draft prompt, font-loading states) — the documented
// host-injection point (a host spreads-extends DEFAULT_CATALOG). Only `en`
// (terminal) and `ja` carry the app keys; every other locale renders them via
// the catalog's per-key fallback to English, so no key is ever missing.

import { type Catalog, DEFAULT_CATALOG, type LanguageCatalog } from '@shojiku/designer';

/** App shell chrome keys — English (the terminal fallback for every locale). */
const APP_CHROME_EN: Readonly<Record<string, string>> = {
  'catalog.title': 'Choose a template',
  'catalog.empty': 'No templates for this language yet.',
  // The language control's accessible name. It SHOWS the current language, and
  // WCAG 2.5.3 wants the name to contain the visible text so a speech-input
  // user can say what they see — hence the value, as an ICU arg rather than a
  // string concatenated at the call site. There is no bare-label variant: it
  // had no consumer left once this one existed.
  'app.localeLabelWith': 'Language: {name}',
  'app.themeLabel': 'Theme',
  'app.themeAuto': 'Auto',
  'app.themeLight': 'Light',
  'app.themeDark': 'Dark',
  'app.back': 'Back to templates',
  'app.open': 'Open…',
  'app.export': 'Export',
  'app.draftRestoreTitle': 'Restore your draft?',
  'app.draftRestoreBody': 'You have unsaved changes to this template.',
  'app.draftRestore': 'Restore',
  'app.draftDiscard': 'Discard',
  'app.fontLoading': 'Loading fonts…',
  'app.fontError': 'Some fonts could not be loaded; rare characters may not render.',
  // The first-load stages. Stage names are noun phrases (they label a row in a
  // list, and one of them is always already done), which is why they are
  // separate keys from the in-editor `app.fontLoading` banner.
  'app.loading.subtitle': 'Preparing this template',
  'app.loading.engine': 'Preparing engine',
  'app.loading.fonts': 'Loading fonts',
  'app.loading.render': 'Preparing preview',
  'app.loading.failed':
    'This template could not be prepared. Go back and try again, or reload the page.',
  'app.loading.failedShort': 'Engine unavailable',
  'app.openError': 'Could not open that file.',
  'app.addFont': 'Add font…',
  'app.fontInstallError': 'That font could not be added. Check your connection and try again.',
  'app.synthError':
    'Sample-data generation is using basic values (the richer generator could not load).',
  'app.renameTitle': 'Rename document',
  'app.saving': 'Saving…',
  'app.saved': 'Saved.',
  'app.saveConflict':
    'Someone else has saved this template. Reopen it to get the latest version before saving again.',
  'app.saveError': 'Could not save. Check your connection and try again.',
  'app.saveLocalError':
    'Could not save in this browser. Free up storage space and try again, or export the file.',
  'mounted.loading': 'Loading…',
  'mounted.loadError': 'Could not reach the server.',
  'mounted.retry': 'Retry',
  'mounted.projectsTitle': 'Projects',
  'mounted.projectsEmpty': 'No projects yet.',
  'mounted.templatesEmpty': 'This project has no templates yet.',
  'mounted.backToProjects': 'Back to projects',
  'fontPicker.title': 'Add a font',
  'fontPicker.close': 'Close',
  'fontPicker.search': 'Search',
  'fontPicker.subset': 'Writing system',
  'fontPicker.subsetAll': 'All',
  'fontPicker.empty': 'No fonts match.',
  'fontPicker.license': 'Licence',
  'fontPicker.add': 'Add this font',
  'fontPicker.installing': 'Adding…',
  'fontPicker.installed': 'Added to this template.',
  'snapshot.title': 'Restore points',
  'snapshot.close': 'Close',
  'snapshot.intro': 'Save this moment before you experiment, so you can come back to it.',
  'snapshot.namePlaceholder': 'Name this point (e.g. before the 2-column table)',
  'snapshot.nameLabel': 'Restore point name',
  'snapshot.capture': 'Save point',
  'snapshot.saved': 'Saved',
  'snapshot.empty': 'No restore points yet. Save one to be able to come back to it.',
  'snapshot.full': 'You have the maximum (10). Delete one to save a new point.',
  'snapshot.error':
    'Could not save the point in this browser. Free up storage space and try again.',
  'snapshot.restore': 'Restore',
  'snapshot.confirmBody': ' will replace your current work. This cannot be undone.',
  'snapshot.confirmCancel': 'Cancel',
  'snapshot.delete': 'Delete',
};

/** Japanese overrides for the app shell chrome. */
const APP_CHROME_JA: Readonly<Record<string, string>> = {
  'catalog.title': 'テンプレートを選ぶ',
  'catalog.empty': 'この言語のテンプレートはまだありません。',
  'app.localeLabelWith': '言語: {name}',
  'app.themeLabel': 'テーマ',
  'app.themeAuto': '自動',
  'app.themeLight': 'ライト',
  'app.themeDark': 'ダーク',
  'app.back': 'テンプレート一覧へ戻る',
  'app.open': '開く…',
  'app.export': '書き出す',
  'app.draftRestoreTitle': '下書きを復元しますか？',
  'app.draftRestoreBody': 'このテンプレートに未保存の変更があります。',
  'app.draftRestore': '復元',
  'app.draftDiscard': '破棄',
  'app.fontLoading': 'フォントを読み込み中…',
  'app.fontError': '一部のフォントを読み込めませんでした。まれな文字が表示されない場合があります。',
  'app.loading.subtitle': 'テンプレートを準備しています',
  'app.loading.engine': 'エンジンを準備',
  'app.loading.fonts': 'フォントを読み込み',
  'app.loading.render': 'プレビューを準備',
  'app.loading.failed':
    'テンプレートを準備できませんでした。戻ってやり直すか、ページを再読み込みしてください。',
  'app.loading.failedShort': 'エンジン読み込み失敗',
  'app.openError': 'ファイルを開けませんでした。',
  'app.addFont': 'フォントを追加…',
  'app.fontInstallError': 'フォントを追加できませんでした。通信環境を確認して再度お試しください。',
  'app.synthError':
    'サンプルデータは簡易な値で生成しています（高度な生成機能を読み込めませんでした）。',
  'app.renameTitle': '文書名を変更',
  'app.saving': '保存中…',
  'app.saved': '保存しました。',
  'app.saveConflict':
    '他の誰かがこのテンプレートを保存しました。最新の内容を開き直してから、もう一度保存してください。',
  'app.saveError': '保存できませんでした。通信環境を確認して再度お試しください。',
  'app.saveLocalError':
    'このブラウザーに保存できませんでした。空き容量を確保して再度お試しいただくか、書き出しをご利用ください。',
  'mounted.loading': '読み込み中…',
  'mounted.loadError': 'サーバーに接続できませんでした。',
  'mounted.retry': '再試行',
  'mounted.projectsTitle': 'プロジェクト',
  'mounted.projectsEmpty': 'プロジェクトはまだありません。',
  'mounted.templatesEmpty': 'このプロジェクトにテンプレートはまだありません。',
  'mounted.backToProjects': 'プロジェクト一覧へ戻る',
  'fontPicker.title': 'フォントを追加',
  'fontPicker.close': '閉じる',
  'fontPicker.search': '検索',
  'fontPicker.subset': '文字体系',
  'fontPicker.subsetAll': 'すべて',
  'fontPicker.empty': '該当するフォントがありません。',
  'fontPicker.license': 'ライセンス',
  'fontPicker.add': 'このフォントを追加',
  'fontPicker.installing': '追加中…',
  'fontPicker.installed': 'このテンプレートに追加済みです。',
  'snapshot.title': '復元ポイント',
  'snapshot.close': '閉じる',
  'snapshot.intro': 'いま実験する前に、この時点の内容を取っておけます。',
  'snapshot.namePlaceholder': 'この時点の名前（例: 表を2列にする前）',
  'snapshot.nameLabel': '復元ポイントの名前',
  'snapshot.capture': '取っておく',
  'snapshot.saved': '保存済み',
  'snapshot.empty':
    'まだ復元ポイントはありません。「取っておく」で、いまの内容に戻れるようにできます。',
  'snapshot.full': '上限（10件）に達しています。新しく取っておくには、どれか削除してください。',
  'snapshot.error': 'このブラウザーに保存できませんでした。空き容量を確保して再度お試しください。',
  'snapshot.restore': '戻す',
  'snapshot.confirmBody': 'に戻します。いまの変更は失われます（取り消せません）。',
  'snapshot.confirmCancel': 'やめる',
  'snapshot.delete': '削除',
};

function extend(base: LanguageCatalog, extra: Readonly<Record<string, string>>): LanguageCatalog {
  return { diagnostics: base.diagnostics, chrome: { ...base.chrome, ...extra } };
}

/** DEFAULT_CATALOG with the app shell chrome merged into en + ja. */
export const APP_CATALOG: Catalog = {
  ...DEFAULT_CATALOG,
  en: extend(DEFAULT_CATALOG.en, APP_CHROME_EN),
  ja: extend(DEFAULT_CATALOG.ja, APP_CHROME_JA),
};
