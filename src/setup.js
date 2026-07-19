// 初回のみGASエディタから initSetup() を手動実行する。
var SEED_PRODUCTS = [
  [1, 'クリアクリーン フレッシュシトラス', '花王', '歯磨き粉', '薬用ハミガキ（チューブ）', 1, 1],
  [2, 'キュキュット 泡パック（微香性）', '花王', '食器用洗剤', 'スプレーボトル本体', 1, 1],
  [3, 'キレイキレイ 薬用泡ハンドソープ', 'ライオン', 'ハンドソープ', 'つめかえ用 1760ml（8.8個分）', 1, 1],
  [4, 'レノア 超消臭 抗菌 SPORTS フレッシュシトラス', 'P&G', '柔軟剤', 'つめかえ 超超特大（約4.9ヶ月分）', 1, 1],
  [5, 'アリエール 99%抗菌+防カビ', 'P&G', '洗濯洗剤', 'つめかえ +100g増量（約76日分）', 1, 1],
  [6, 'クリニカ Kid\'s いちご香味', 'ライオン', '歯磨き粉（子ども用）', '薬用ハミガキ', 1, 1],
  [7, 'バウンシア ホワイトソープの香り', '牛乳石鹸', 'ボディソープ', 'つめかえ用 特大 1120ml（3.1個分）', 1, 1],
  [8, 'キュキュット クリア除菌', '花王', '食器用洗剤', 'つめかえ用 特大 700ml', 1, 1],
  [9, 'ワイドハイター EXパワー', '花王', '衣料用漂白剤', '酸素系 大サイズ 1000ml', 1, 1]
];

function initSetup() {
  if (props_().getProperty('SPREADSHEET_ID')) {
    throw new Error('初期設定はすでに完了しています。やり直す場合はScript Propertiesを空にしてください。');
  }
  var ss = SpreadsheetApp.create('日用品在庫管理');
  var ps = ss.getActiveSheet();
  ps.setName('商品');
  ps.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
  var rows = SEED_PRODUCTS.map(function (r) { return r.concat(['', new Date()]); });
  ps.getRange(2, 1, rows.length, HEADER.length).setValues(rows);

  var hs = ss.insertSheet('在庫履歴');
  hs.getRange(1, 1, 1, 4).setValues([['日時', '商品ID', '変更前', '変更後']]);

  var cs = ss.insertSheet('設定');
  cs.getRange(1, 1, 2, 2).setValues([['キー', '値'], ['予測通知', 'OFF']]);

  var root = DriveApp.createFolder('日用品在庫管理');
  var photoFolder = root.createFolder('写真');
  var pdfFolder = root.createFolder('買い物リスト');

  props_().setProperties({
    SPREADSHEET_ID: ss.getId(),
    PHOTO_FOLDER_ID: photoFolder.getId(),
    PDF_FOLDER_ID: pdfFolder.getId()
  });

  recreateTriggers();

  Logger.log('セットアップ完了');
  Logger.log('スプレッドシート: ' + ss.getUrl());
  Logger.log('通知はLINEに届きます（LINE_CHANNEL_TOKENの設定が必要）。');
}

// トリガーをすべて削除して作り直す。appsscript.jsonのタイムゾーン修正後や、
// トリガー時刻を変更したいときにGASエディタから手動実行する。
function recreateTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('reminderTrigger').timeBased().onMonthDay(17).atHour(19).create();
  ScriptApp.newTrigger('reminderTrigger').timeBased().onMonthDay(18).atHour(19).create();
  ScriptApp.newTrigger('reminderTrigger').timeBased().onMonthDay(19).atHour(6).create();
  ScriptApp.newTrigger('monthlyPdfTrigger').timeBased().onMonthDay(19).atHour(7).create();
  ScriptApp.newTrigger('predictionTrigger').timeBased().everyDays(1).atHour(8).create();
}
