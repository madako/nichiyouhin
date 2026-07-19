# 日用品在庫管理ツール 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Googleスプレッドシートをデータ置き場とするGAS Webアプリで、スマホから日用品の在庫管理・買い物リストPDF自動生成・ntfyプッシュ通知を実現する。

**Architecture:** 純粋ロジック（買い物リスト抽出・通知スキップ判定・消費ペース予測）は `src/logic.js` に隔離してNodeでユニットテストする。GAS API依存コード（シート読み書き・Drive・トリガー・UrlFetch）は薄いレイヤーに分け、手動チェックリストで検証する。UIはHTML Serviceの1ページアプリ（タブ3枚）。

**Tech Stack:** Google Apps Script (V8) / clasp / Node.js built-in test runner (`node --test`) / ntfy.sh

## Global Constraints

- タイムゾーン: `Asia/Tokyo`（appsscript.json に記載）
- UI・通知・PDF・コミットメッセージはすべて日本語
- 無料枠のみで完結（有料サービス禁止）
- Webアプリのアクセス権: `"access": "MYSELF"`, `"executeAs": "USER_DEPLOYING"`（本人のみ）
- トリガー: リマインダー 毎月17日19時台・18日19時台・19日6時台 / PDF生成 毎月19日7時台 / 予測チェック 毎日8時台（GASのトリガーは指定時刻から1時間以内のどこかで実行される仕様。SETUP.mdに明記すること）
- PDFファイル名: `買い物リスト_YYYY-MM-DD.pdf`、対象0件の月は生成しない
- 「商品」シートの列順: `ID, 商品名, メーカー, カテゴリ, 容量・備考, 在庫数, 発注基準, 写真, 更新日時`
- 「在庫履歴」シートの列順: `日時, 商品ID, 変更前, 変更後`
- 「設定」シート: `キー, 値` 形式。初期行 `予測通知 | OFF`
- ntfyトピック名・スプレッドシートID等の秘密情報はScript Propertiesに保存し、**リポジトリに一切コミットしない**（リポジトリはpublic）
- `.clasp.json` はgitignoreする
- 商品オブジェクトの型（全タスク共通）: `{id:number, name:string, maker:string, category:string, note:string, stock:number, threshold:number, photoId:string, updatedAt:string}`

---

### Task 1: プロジェクト土台

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `src/appsscript.json`
- Create: `.clasp.json.example`
- Create: `README.md`

**Interfaces:**
- Produces: `npm test` で `node --test test/` が動く土台。`src/` がclaspのrootDir。

- [ ] **Step 1: 各ファイルを作成**

`package.json`:
```json
{
  "name": "nichiyouhin",
  "private": true,
  "scripts": {
    "test": "node --test test/"
  }
}
```

`.gitignore`:
```
node_modules/
.clasp.json
.vs/
```

`src/appsscript.json`:
```json
{
  "timeZone": "Asia/Tokyo",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "access": "MYSELF",
    "executeAs": "USER_DEPLOYING"
  }
}
```

`.clasp.json.example`（`clasp create` 後に実物の `.clasp.json` が自動生成される。これはコミット用の見本）:
```json
{
  "scriptId": "＜clasp create で発行されるID＞",
  "rootDir": "src"
}
```

`README.md`:
```markdown
# nichiyouhin — 日用品在庫管理ツール

Googleスプレッドシート + Apps Script による日用品在庫管理ツール。
スマホから在庫を管理し、買い物リストPDFの自動生成とntfyプッシュ通知を行う。

- 設計書: docs/superpowers/specs/2026-07-18-nichiyouhin-design.md
- 導入手順: SETUP.md（実装完了後に作成）
- テスト: `npm test`（Node.js 20以上）
```

- [ ] **Step 2: テストランナーが動くことを確認**

Run: `npm test`
Expected: テスト0件で正常終了（exit 0。Node 20系は "no test files" でも0で終わる。exit 1になる場合は `test/` ディレクトリを `mkdir test` で作って空の `test/.gitkeep` を置く）

- [ ] **Step 3: Commit**

```bash
git add package.json .gitignore src/appsscript.json .clasp.json.example README.md
git commit -m "chore: プロジェクト土台（clasp/npm test設定）を追加" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 純粋ロジック — 列検証と買い物リスト抽出

**Files:**
- Create: `src/logic.js`
- Create: `test/logic.test.js`

**Interfaces:**
- Produces: `HEADER`（列名配列）, `validateHeader(row) → boolean`, `buildShoppingList(products) → products`（`stock <= threshold` の商品のみ）。GASとNode両方から使えるよう、ファイル末尾の `module.exports` ガードが必須。

- [ ] **Step 1: 失敗するテストを書く**

`test/logic.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert');
const { HEADER, validateHeader, buildShoppingList } = require('../src/logic.js');

test('validateHeader: 正しい列順ならtrue', () => {
  assert.strictEqual(validateHeader(['ID', '商品名', 'メーカー', 'カテゴリ', '容量・備考', '在庫数', '発注基準', '写真', '更新日時']), true);
});

test('validateHeader: 列がずれていればfalse', () => {
  assert.strictEqual(validateHeader(['商品名', 'ID', 'メーカー', 'カテゴリ', '容量・備考', '在庫数', '発注基準', '写真', '更新日時']), false);
});

test('buildShoppingList: 在庫数が発注基準以下の商品のみ返す', () => {
  const products = [
    { id: 1, name: 'A', stock: 0, threshold: 1 },
    { id: 2, name: 'B', stock: 1, threshold: 1 },
    { id: 3, name: 'C', stock: 2, threshold: 1 },
  ];
  assert.deepStrictEqual(buildShoppingList(products).map(p => p.id), [1, 2]);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`Cannot find module '../src/logic.js'`）

- [ ] **Step 3: 最小実装**

`src/logic.js`:
```js
// 純粋ロジック（GAS APIに依存しない）。Nodeでテストする。
var HEADER = ['ID', '商品名', 'メーカー', 'カテゴリ', '容量・備考', '在庫数', '発注基準', '写真', '更新日時'];

function validateHeader(row) {
  return HEADER.every(function (h, i) { return row[i] === h; });
}

function buildShoppingList(products) {
  return products.filter(function (p) { return p.stock <= p.threshold; });
}

if (typeof module !== 'undefined') {
  module.exports = { HEADER: HEADER, validateHeader: validateHeader, buildShoppingList: buildShoppingList };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: PASS（3件）

- [ ] **Step 5: Commit**

```bash
git add src/logic.js test/logic.test.js
git commit -m "feat: 列検証と買い物リスト抽出ロジックを追加" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 純粋ロジック — リマインダーのスキップ判定

**Files:**
- Modify: `src/logic.js`
- Modify: `test/logic.test.js`

**Interfaces:**
- Produces: `shouldSkipReminder(historyTimestamps, now) → boolean`。`historyTimestamps` は `Date` の配列、`now` は `Date`。当月17日0:00以降のタイムスタンプが1件でもあればtrue。

- [ ] **Step 1: 失敗するテストを追記**

`test/logic.test.js` に追記:
```js
const { shouldSkipReminder } = require('../src/logic.js');

test('shouldSkipReminder: 当月17日以降に履歴があればtrue', () => {
  const now = new Date(2026, 7, 18, 19, 0); // 2026-08-18 19:00
  const history = [new Date(2026, 7, 17, 8, 30)];
  assert.strictEqual(shouldSkipReminder(history, now), true);
});

test('shouldSkipReminder: 履歴が当月17日より前ならfalse', () => {
  const now = new Date(2026, 7, 18, 19, 0);
  const history = [new Date(2026, 7, 16, 23, 59)];
  assert.strictEqual(shouldSkipReminder(history, now), false);
});

test('shouldSkipReminder: 先月17日以降の履歴は対象外', () => {
  const now = new Date(2026, 7, 17, 19, 0);
  const history = [new Date(2026, 6, 20, 10, 0)]; // 2026-07-20
  assert.strictEqual(shouldSkipReminder(history, now), false);
});

test('shouldSkipReminder: 履歴が空ならfalse', () => {
  assert.strictEqual(shouldSkipReminder([], new Date(2026, 7, 17, 19, 0)), false);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`shouldSkipReminder is not a function`）

- [ ] **Step 3: 最小実装**

`src/logic.js` の `module.exports` ガードの前に追記し、exportsにも追加:
```js
function shouldSkipReminder(historyTimestamps, now) {
  var windowStart = new Date(now.getFullYear(), now.getMonth(), 17, 0, 0, 0);
  return historyTimestamps.some(function (t) { return t >= windowStart && t <= now; });
}
```

`module.exports` を以下に更新:
```js
if (typeof module !== 'undefined') {
  module.exports = {
    HEADER: HEADER,
    validateHeader: validateHeader,
    buildShoppingList: buildShoppingList,
    shouldSkipReminder: shouldSkipReminder
  };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: PASS（7件）

- [ ] **Step 5: Commit**

```bash
git add src/logic.js test/logic.test.js
git commit -m "feat: 在庫確認リマインダーのスキップ判定を追加" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 純粋ロジック — 消費ペースからの在庫切れ予測

**Files:**
- Modify: `src/logic.js`
- Modify: `test/logic.test.js`

**Interfaces:**
- Produces: `estimateDaysUntilBelowThreshold(history, product, now) → number|null`。`history` はその商品の `{date:Date, before:number, after:number}` 昇順配列。減少イベント2件未満・観測期間14日未満なら `null`（データ不足）。`stock <= threshold` なら `0`。それ以外は発注基準に達するまでの推定日数。

- [ ] **Step 1: 失敗するテストを追記**

`test/logic.test.js` に追記:
```js
const { estimateDaysUntilBelowThreshold } = require('../src/logic.js');

test('予測: 減少イベントが2件未満ならnull', () => {
  const history = [{ date: new Date(2026, 0, 1), before: 3, after: 2 }];
  const p = { stock: 2, threshold: 1 };
  assert.strictEqual(estimateDaysUntilBelowThreshold(history, p, new Date(2026, 1, 1)), null);
});

test('予測: 観測期間14日未満ならnull', () => {
  const history = [
    { date: new Date(2026, 0, 1), before: 3, after: 2 },
    { date: new Date(2026, 0, 5), before: 2, after: 1 },
  ];
  const p = { stock: 1, threshold: 0 };
  assert.strictEqual(estimateDaysUntilBelowThreshold(history, p, new Date(2026, 0, 10)), null);
});

test('予測: すでに基準以下なら0', () => {
  const history = [
    { date: new Date(2026, 0, 1), before: 3, after: 2 },
    { date: new Date(2026, 0, 20), before: 2, after: 1 },
  ];
  const p = { stock: 1, threshold: 1 };
  assert.strictEqual(estimateDaysUntilBelowThreshold(history, p, new Date(2026, 1, 1)), 0);
});

test('予測: 消費ペースから残日数を推定する', () => {
  // 30日で2個減 → 0.0667個/日。stock 3, threshold 1 → 残2個 ÷ 0.0667 = 30日
  const history = [
    { date: new Date(2026, 0, 1), before: 5, after: 4 },
    { date: new Date(2026, 0, 16), before: 4, after: 3 },
  ];
  const p = { stock: 3, threshold: 1 };
  const days = estimateDaysUntilBelowThreshold(history, p, new Date(2026, 0, 31));
  assert.ok(Math.abs(days - 30) < 0.01, 'expected ~30, got ' + days);
});

test('予測: 増加のみ（買い足しだけ）の履歴はnull', () => {
  const history = [
    { date: new Date(2026, 0, 1), before: 1, after: 2 },
    { date: new Date(2026, 0, 20), before: 2, after: 3 },
  ];
  const p = { stock: 3, threshold: 1 };
  assert.strictEqual(estimateDaysUntilBelowThreshold(history, p, new Date(2026, 1, 1)), null);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`estimateDaysUntilBelowThreshold is not a function`）

- [ ] **Step 3: 最小実装**

`src/logic.js` に追記（exportsにも追加）:
```js
function estimateDaysUntilBelowThreshold(history, product, now) {
  var dec = history.filter(function (h) { return h.after < h.before; });
  if (dec.length < 2) return null;
  var elapsedDays = (now - dec[0].date) / 86400000;
  if (elapsedDays < 14) return null;
  var totalDec = dec.reduce(function (s, h) { return s + (h.before - h.after); }, 0);
  var perDay = totalDec / elapsedDays;
  if (perDay <= 0) return null;
  if (product.stock <= product.threshold) return 0;
  return (product.stock - product.threshold) / perDay;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: PASS（12件）

- [ ] **Step 5: Commit**

```bash
git add src/logic.js test/logic.test.js
git commit -m "feat: 消費ペースからの在庫切れ予測ロジックを追加" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: リポジトリ層（シート読み書き）

**Files:**
- Create: `src/repository.js`

**Interfaces:**
- Consumes: `HEADER`, `validateHeader`（logic.js）
- Produces（後続タスクが使う。すべてGAS環境専用・Nodeテスト対象外）:
  - `props_() → ScriptProperties`
  - `getProducts() → Product[]`（列ずれ時は日本語メッセージでthrow）
  - `changeStock(id, delta) → number`（0未満にはならない。履歴追記・更新日時記録込み）
  - `getHistoryTimestamps() → Date[]`
  - `getHistoryForProduct(id) → {date, before, after}[]`（昇順）
  - `isPredictionEnabled() → boolean`（設定シート「予測通知」=== 'ON'）
  - `nextProductId_() → number` / `addProductRow(p)` / `updateProductRow(p)` / `deleteProductRow(id)`
  - `savePhoto(base64, mimeType, name) → fileId` / `getPhotoDataUrl(photoId) → string`

- [ ] **Step 1: 実装を書く**

`src/repository.js`:
```js
// GAS API依存のデータアクセス層。動作確認はSETUP.mdの手動チェックリストで行う。
function props_() { return PropertiesService.getScriptProperties(); }
function ss_() { return SpreadsheetApp.openById(props_().getProperty('SPREADSHEET_ID')); }
function productSheet_() { return ss_().getSheetByName('商品'); }
function historySheet_() { return ss_().getSheetByName('在庫履歴'); }
function configSheet_() { return ss_().getSheetByName('設定'); }

function rowToProduct_(r) {
  return {
    id: Number(r[0]), name: String(r[1]), maker: String(r[2]), category: String(r[3]),
    note: String(r[4]), stock: Number(r[5]), threshold: Number(r[6]), photoId: String(r[7]),
    updatedAt: r[8] ? Utilities.formatDate(new Date(r[8]), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') : ''
  };
}

function getProducts() {
  var values = productSheet_().getDataRange().getValues();
  if (!validateHeader(values[0])) {
    throw new Error('「商品」シートの列がずれています。1行目を「' + HEADER.join('、') + '」の順に直してください。');
  }
  return values.slice(1)
    .filter(function (r) { return r[0] !== ''; })
    .map(rowToProduct_);
}

function findRowIndexById_(id) {
  var ids = productSheet_().getRange(2, 1, Math.max(productSheet_().getLastRow() - 1, 1), 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (Number(ids[i][0]) === Number(id)) return i + 2;
  }
  throw new Error('ID ' + id + ' の商品が見つかりません。');
}

function changeStock(id, delta) {
  var sheet = productSheet_();
  var row = findRowIndexById_(id);
  var before = Number(sheet.getRange(row, 6).getValue());
  var after = Math.max(0, before + Number(delta));
  sheet.getRange(row, 6).setValue(after);
  sheet.getRange(row, 9).setValue(new Date());
  historySheet_().appendRow([new Date(), Number(id), before, after]);
  return after;
}

function historyRows_() {
  var sheet = historySheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
}

function getHistoryTimestamps() {
  return historyRows_().map(function (r) { return new Date(r[0]); });
}

function getHistoryForProduct(id) {
  return historyRows_()
    .filter(function (r) { return Number(r[1]) === Number(id); })
    .map(function (r) { return { date: new Date(r[0]), before: Number(r[2]), after: Number(r[3]) }; })
    .sort(function (a, b) { return a.date - b.date; });
}

function isPredictionEnabled() {
  var values = configSheet_().getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === '予測通知') return String(values[i][1]).toUpperCase() === 'ON';
  }
  return false;
}

function nextProductId_() {
  var max = 0;
  getProducts().forEach(function (p) { if (p.id > max) max = p.id; });
  return max + 1;
}

function addProductRow(p) {
  productSheet_().appendRow([p.id, p.name, p.maker, p.category, p.note, p.stock, p.threshold, p.photoId || '', new Date()]);
}

function updateProductRow(p) {
  var row = findRowIndexById_(p.id);
  productSheet_().getRange(row, 2, 1, 7).setValues([[p.name, p.maker, p.category, p.note, p.stock, p.threshold, p.photoId || '']]);
  productSheet_().getRange(row, 9).setValue(new Date());
}

function deleteProductRow(id) {
  productSheet_().deleteRow(findRowIndexById_(id));
}

function savePhoto(base64, mimeType, name) {
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, name);
  var file = DriveApp.getFolderById(props_().getProperty('PHOTO_FOLDER_ID')).createFile(blob);
  return file.getId();
}

function getPhotoDataUrl(photoId) {
  var blob = DriveApp.getFileById(photoId).getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}
```

- [ ] **Step 2: 既存テストが壊れていないことを確認**

Run: `npm test`
Expected: PASS（12件。repository.jsはNodeから読み込まれないため影響なし）

- [ ] **Step 3: Commit**

```bash
git add src/repository.js
git commit -m "feat: スプレッドシート読み書きのリポジトリ層を追加" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 初期セットアップ（シート作成・初期データ・トリガー）

**Files:**
- Create: `src/setup.js`

**Interfaces:**
- Consumes: `props_`, `HEADER`（前タスク）
- Produces: `initSetup()`（GASエディタから手動実行する一回きりの関数）。トリガー関数名 `reminderTrigger` / `monthlyPdfTrigger` / `predictionTrigger` をここで予約する（実体はTask 7・8で定義）。Script Propertiesキー: `SPREADSHEET_ID`, `PHOTO_FOLDER_ID`, `PDF_FOLDER_ID`, `NTFY_TOPIC`。

- [ ] **Step 1: 実装を書く**

`src/setup.js`:
```js
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
  var topic = 'nichiyouhin-' + Utilities.getUuid();

  props_().setProperties({
    SPREADSHEET_ID: ss.getId(),
    PHOTO_FOLDER_ID: photoFolder.getId(),
    PDF_FOLDER_ID: pdfFolder.getId(),
    NTFY_TOPIC: topic
  });

  ScriptApp.newTrigger('reminderTrigger').timeBased().onMonthDay(17).atHour(19).create();
  ScriptApp.newTrigger('reminderTrigger').timeBased().onMonthDay(18).atHour(19).create();
  ScriptApp.newTrigger('reminderTrigger').timeBased().onMonthDay(19).atHour(6).create();
  ScriptApp.newTrigger('monthlyPdfTrigger').timeBased().onMonthDay(19).atHour(7).create();
  ScriptApp.newTrigger('predictionTrigger').timeBased().everyDays(1).atHour(8).create();

  Logger.log('セットアップ完了');
  Logger.log('スプレッドシート: ' + ss.getUrl());
  Logger.log('ntfyトピック名（スマホのntfyアプリで購読する）: ' + topic);
}
```

- [ ] **Step 2: 既存テストが壊れていないことを確認**

Run: `npm test`
Expected: PASS（12件）

- [ ] **Step 3: Commit**

```bash
git add src/setup.js
git commit -m "feat: 初期セットアップ（シート・フォルダ・トリガー作成）を追加" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: ntfy通知（リマインダー・予測）

**Files:**
- Create: `src/notify.js`

**Interfaces:**
- Consumes: `props_`, `getProducts`, `getHistoryTimestamps`, `getHistoryForProduct`, `isPredictionEnabled`（repository.js）、`buildShoppingList`, `shouldSkipReminder`, `estimateDaysUntilBelowThreshold`（logic.js）
- Produces: `sendNtfy_(message)`, `reminderTrigger()`, `predictionTrigger()`, `testNtfy()`（動作確認用）

- [ ] **Step 1: 実装を書く**

`src/notify.js`:
```js
function sendNtfy_(message) {
  var topic = props_().getProperty('NTFY_TOPIC');
  UrlFetchApp.fetch('https://ntfy.sh/' + encodeURIComponent(topic), {
    method: 'post',
    payload: message,
    contentType: 'text/plain; charset=utf-8'
  });
}

// 毎月17日19時台・18日19時台・19日6時台に実行
function reminderTrigger() {
  var now = new Date();
  if (shouldSkipReminder(getHistoryTimestamps(), now)) return;
  var count = buildShoppingList(getProducts()).length;
  sendNtfy_('【日用品】在庫の確認・入力をお願いします。現在の買い時商品: ' + count + '件');
}

// 毎日8時台に実行（設定シート「予測通知」がONのときだけ通知）
function predictionTrigger() {
  if (!isPredictionEnabled()) return;
  var now = new Date();
  var soon = [];
  getProducts().forEach(function (p) {
    if (p.stock <= p.threshold) return; // すでに買い物リスト入りは対象外
    var days = estimateDaysUntilBelowThreshold(getHistoryForProduct(p.id), p, now);
    if (days !== null && days <= 7) soon.push(p.name + '（あと約' + Math.round(days) + '日）');
  });
  if (soon.length > 0) sendNtfy_('【日用品】もうすぐ無くなりそうです: ' + soon.join('、'));
}

// SETUP時の動作確認用。GASエディタから手動実行する。
function testNtfy() {
  sendNtfy_('【日用品】テスト通知です。この通知が見えていれば設定成功です！');
}
```

- [ ] **Step 2: 既存テストが壊れていないことを確認**

Run: `npm test`
Expected: PASS（12件）

- [ ] **Step 3: Commit**

```bash
git add src/notify.js
git commit -m "feat: ntfyによるリマインダー通知と予測通知を追加" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 買い物リストPDFの自動生成

**Files:**
- Create: `src/pdf.js`

**Interfaces:**
- Consumes: `props_`, `getProducts`, `getPhotoDataUrl`（repository.js）、`buildShoppingList`（logic.js）
- Produces: `monthlyPdfTrigger()`, `generateShoppingListPdf() → File|null`（0件ならnull）、`escapeHtml_(s)`

- [ ] **Step 1: 実装を書く**

`src/pdf.js`:
```js
function escapeHtml_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 毎月19日7時台に実行
function monthlyPdfTrigger() {
  generateShoppingListPdf();
}

function generateShoppingListPdf() {
  var items = buildShoppingList(getProducts());
  if (items.length === 0) return null;
  var dateStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var rows = items.map(function (p) {
    var img = p.photoId
      ? '<img src="' + getPhotoDataUrl(p.photoId) + '" style="width:120px;max-height:120px;object-fit:contain">'
      : '';
    return '<tr>' +
      '<td style="text-align:center">' + img + '</td>' +
      '<td><b>' + escapeHtml_(p.name) + '</b><br>' + escapeHtml_(p.maker) + '</td>' +
      '<td>' + escapeHtml_(p.note) + '</td>' +
      '<td style="text-align:center">' + p.stock + ' → 基準 ' + p.threshold + '</td>' +
      '</tr>';
  }).join('');
  var html = '<html><head><meta charset="utf-8"></head><body>' +
    '<h1>買い物リスト ' + dateStr + '</h1>' +
    '<table border="1" cellspacing="0" cellpadding="8" style="border-collapse:collapse;font-size:14px">' +
    '<tr><th>写真</th><th>商品</th><th>容量・備考</th><th>在庫</th></tr>' + rows + '</table>' +
    '</body></html>';
  var blob = Utilities.newBlob(html, 'text/html', 'list.html')
    .getAs(MimeType.PDF)
    .setName('買い物リスト_' + dateStr + '.pdf');
  return DriveApp.getFolderById(props_().getProperty('PDF_FOLDER_ID')).createFile(blob);
}
```

- [ ] **Step 2: 既存テストが壊れていないことを確認**

Run: `npm test`
Expected: PASS（12件）

- [ ] **Step 3: Commit**

```bash
git add src/pdf.js
git commit -m "feat: 買い物リストPDFの自動生成を追加" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Webアプリ画面（API・HTML・スタイル・クライアントJS）

**Files:**
- Create: `src/main.js`
- Create: `src/api.js`
- Create: `src/index.html`
- Create: `src/style.html`
- Create: `src/app.html`

**Interfaces:**
- Consumes: repository.jsの全関数
- Produces: `doGet()`, `include(name)`, クライアントから `google.script.run` で呼ぶ `apiGetData() → Product[]` / `apiChangeStock(id, delta) → number` / `apiSaveProduct(p, photo|null) → number`（photoは `{base64, mimeType}`）/ `apiDeleteProduct(id)`

- [ ] **Step 1: サーバ側を書く**

`src/main.js`:
```js
function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('日用品在庫管理')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
```

`src/api.js`:
```js
function apiGetData() {
  return getProducts();
}

function apiChangeStock(id, delta) {
  return changeStock(id, delta);
}

// p: {id?, name, maker, category, note, stock, threshold, photoId?}
// photo: {base64, mimeType} または null
function apiSaveProduct(p, photo) {
  if (!p.name) throw new Error('商品名を入力してください。');
  p.stock = Math.max(0, Number(p.stock) || 0);
  p.threshold = Math.max(0, Number(p.threshold) || 0);
  if (photo) p.photoId = savePhoto(photo.base64, photo.mimeType, p.name + '.jpg');
  if (p.id) {
    updateProductRow(p);
  } else {
    p.id = nextProductId_();
    addProductRow(p);
  }
  return p.id;
}

function apiDeleteProduct(id) {
  deleteProductRow(id);
}
```

- [ ] **Step 2: 画面の骨格を書く**

`src/index.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <meta charset="utf-8">
  <?!= include('style'); ?>
</head>
<body>
  <nav>
    <button class="tab active" data-view="stock" onclick="setView('stock')">在庫一覧</button>
    <button class="tab" data-view="list" onclick="setView('list')">🛒買い物リスト</button>
    <button class="tab" data-view="edit" onclick="setView('edit')">商品管理</button>
  </nav>
  <main id="content"><p class="center">読み込み中...</p></main>
  <?!= include('app'); ?>
</body>
</html>
```

`src/style.html`:
```html
<style>
* { box-sizing: border-box; margin: 0; }
body { font-family: sans-serif; background: #f5f5f5; padding-bottom: 40px; }
nav { display: flex; position: sticky; top: 0; background: #fff; border-bottom: 2px solid #ddd; z-index: 10; }
.tab { flex: 1; padding: 14px 4px; border: none; background: none; font-size: 14px; color: #666; }
.tab.active { color: #1a73e8; border-bottom: 3px solid #1a73e8; font-weight: bold; }
main { padding: 12px; }
h2 { font-size: 14px; color: #888; margin: 16px 0 8px; }
.center { text-align: center; padding: 24px; color: #888; }
.error { color: #c00; padding: 12px; }
.card { display: flex; align-items: center; background: #fff; border-radius: 10px; padding: 10px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
.card.low { background: #fff0f0; border: 1px solid #f5b5b5; }
.card img, .noimg { width: 56px; height: 56px; object-fit: cover; border-radius: 8px; background: #eee; flex-shrink: 0; }
.info { flex: 1; min-width: 0; padding: 0 10px; }
.name { font-size: 15px; font-weight: bold; }
.meta { font-size: 12px; color: #888; }
.badge { color: #c00; font-size: 12px; }
.ctrl { display: flex; align-items: center; gap: 6px; }
.ctrl button { width: 44px; height: 44px; font-size: 22px; border: 1px solid #ccc; border-radius: 50%; background: #fff; }
.stock { min-width: 28px; text-align: center; font-size: 18px; font-weight: bold; }
.bigcard { background: #fff; border-radius: 10px; padding: 14px; margin-bottom: 10px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
.bigcard img { max-width: 70%; max-height: 220px; border-radius: 8px; }
form label { display: block; margin: 12px 0 4px; font-size: 13px; color: #555; }
form input, form select { width: 100%; padding: 10px; font-size: 16px; border: 1px solid #ccc; border-radius: 6px; }
.btn { display: inline-block; width: 100%; padding: 14px; margin-top: 16px; font-size: 16px; border: none; border-radius: 8px; background: #1a73e8; color: #fff; }
.btn.danger { background: #d33; }
.btn.plain { background: #eee; color: #333; }
.editrow { display: flex; justify-content: space-between; align-items: center; background: #fff; border-radius: 8px; padding: 12px; margin-bottom: 6px; }
</style>
```

- [ ] **Step 3: クライアントJSを書く**

`src/app.html`:
```html
<script>
var products = [];
var view = 'stock';
var editing = null; // 編集中の商品 or 新規なら {}

function esc(s) {
  var d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}
function photoUrl(p) {
  return p.photoId ? 'https://drive.google.com/thumbnail?id=' + p.photoId + '&sz=w400' : '';
}
function content() { return document.getElementById('content'); }

function load() {
  content().innerHTML = '<p class="center">読み込み中...</p>';
  google.script.run
    .withSuccessHandler(function (data) { products = data; render(); })
    .withFailureHandler(showError)
    .apiGetData();
}
function showError(err) {
  content().innerHTML = '<p class="error">エラー: ' + esc(err && err.message ? err.message : err) +
    '</p><button class="btn plain" onclick="load()">再読み込み</button>';
}
function setView(v) {
  view = v;
  editing = null;
  document.querySelectorAll('.tab').forEach(function (t) {
    t.classList.toggle('active', t.dataset.view === v);
  });
  render();
}
function render() {
  if (view === 'stock') renderStock();
  else if (view === 'list') renderList();
  else renderEdit();
}

function renderStock() {
  var cats = [];
  products.forEach(function (p) { if (cats.indexOf(p.category) < 0) cats.push(p.category); });
  var html = '';
  cats.forEach(function (c) {
    html += '<h2>' + esc(c) + '</h2>';
    products.filter(function (p) { return p.category === c; }).forEach(function (p) {
      var low = p.stock <= p.threshold;
      html += '<div class="card' + (low ? ' low' : '') + '">' +
        (photoUrl(p) ? '<img src="' + photoUrl(p) + '">' : '<div class="noimg"></div>') +
        '<div class="info"><div class="name">' + esc(p.name) +
        (low ? ' <span class="badge">🛒買い時</span>' : '') + '</div>' +
        '<div class="meta">' + esc(p.maker) + ' ' + esc(p.note) + '</div></div>' +
        '<div class="ctrl"><button onclick="change(' + p.id + ',-1)">−</button>' +
        '<span class="stock">' + p.stock + '</span>' +
        '<button onclick="change(' + p.id + ',1)">＋</button></div></div>';
    });
  });
  content().innerHTML = html || '<p class="center">商品がありません</p>';
}

function change(id, delta) {
  google.script.run
    .withSuccessHandler(function (after) {
      var p = products.find(function (x) { return x.id === id; });
      p.stock = after;
      render();
    })
    .withFailureHandler(function (e) { showError(e); load(); })
    .apiChangeStock(id, delta);
}

function renderList() {
  var items = products.filter(function (p) { return p.stock <= p.threshold; });
  if (items.length === 0) {
    content().innerHTML = '<p class="center">買い時の商品はありません 🎉</p>';
    return;
  }
  content().innerHTML = items.map(function (p) {
    return '<div class="bigcard">' +
      (photoUrl(p) ? '<img src="' + photoUrl(p) + '">' : '') +
      '<div class="name">' + esc(p.name) + '</div>' +
      '<div class="meta">' + esc(p.maker) + ' ' + esc(p.note) + '</div>' +
      '<div class="meta">在庫 ' + p.stock + '（基準 ' + p.threshold + '）</div></div>';
  }).join('');
}

function renderEdit() {
  if (editing) { renderForm(); return; }
  var html = '<button class="btn" onclick="editing={};render()">＋ 新しい商品を追加</button>';
  html += products.map(function (p) {
    return '<div class="editrow"><span>' + esc(p.name) + '</span>' +
      '<button class="btn plain" style="width:auto;margin:0;padding:8px 16px" ' +
      'onclick="editing=products.find(function(x){return x.id===' + p.id + '});render()">編集</button></div>';
  }).join('');
  content().innerHTML = html;
}

function renderForm() {
  var p = editing;
  var isNew = !p.id;
  content().innerHTML =
    '<form onsubmit="return submitForm()">' +
    '<label>商品名</label><input id="f-name" value="' + esc(p.name || '') + '" required>' +
    '<label>メーカー</label><input id="f-maker" value="' + esc(p.maker || '') + '">' +
    '<label>カテゴリ</label><input id="f-category" value="' + esc(p.category || '') + '" list="cats">' +
    '<datalist id="cats">' +
    products.map(function (x) { return x.category; })
      .filter(function (c, i, a) { return a.indexOf(c) === i; })
      .map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') +
    '</datalist>' +
    '<label>容量・備考</label><input id="f-note" value="' + esc(p.note || '') + '">' +
    '<label>在庫数</label><input id="f-stock" type="number" min="0" value="' + (p.stock != null ? p.stock : 1) + '">' +
    '<label>発注基準（この数以下で買い物リストへ）</label><input id="f-threshold" type="number" min="0" value="' + (p.threshold != null ? p.threshold : 1) + '">' +
    '<label>写真（変更する場合のみ選択）</label><input id="f-photo" type="file" accept="image/*" capture="environment">' +
    '<button class="btn" type="submit">保存</button>' +
    (isNew ? '' : '<button class="btn danger" type="button" onclick="delProduct(' + p.id + ')">この商品を削除</button>') +
    '<button class="btn plain" type="button" onclick="editing=null;render()">キャンセル</button>' +
    '</form>';
}

function submitForm() {
  var p = {
    id: editing.id || null,
    name: document.getElementById('f-name').value.trim(),
    maker: document.getElementById('f-maker').value.trim(),
    category: document.getElementById('f-category').value.trim() || 'その他',
    note: document.getElementById('f-note').value.trim(),
    stock: Number(document.getElementById('f-stock').value),
    threshold: Number(document.getElementById('f-threshold').value),
    photoId: editing.photoId || ''
  };
  var fileInput = document.getElementById('f-photo');
  content().innerHTML = '<p class="center">保存中...</p>';
  if (fileInput.files.length > 0) {
    var file = fileInput.files[0];
    var reader = new FileReader();
    reader.onload = function () {
      var base64 = reader.result.split(',')[1];
      saveProduct(p, { base64: base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  } else {
    saveProduct(p, null);
  }
  return false;
}

function saveProduct(p, photo) {
  google.script.run
    .withSuccessHandler(function () { editing = null; load(); })
    .withFailureHandler(function (e) { showError(e); })
    .apiSaveProduct(p, photo);
}

function delProduct(id) {
  if (!confirm('この商品を削除しますか？')) return;
  google.script.run
    .withSuccessHandler(function () { editing = null; load(); })
    .withFailureHandler(showError)
    .apiDeleteProduct(id);
}

window.addEventListener('load', load);
</script>
```

- [ ] **Step 4: 既存テストが壊れていないことを確認**

Run: `npm test`
Expected: PASS（12件）

- [ ] **Step 5: Commit**

```bash
git add src/main.js src/api.js src/index.html src/style.html src/app.html
git commit -m "feat: スマホ向けWebアプリ画面（在庫一覧・買い物リスト・商品管理）を追加" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: SETUP.md（導入手順書＋手動テストチェックリスト）

**Files:**
- Create: `SETUP.md`

**Interfaces:**
- Consumes: これまでの全関数名（`initSetup`, `testNtfy`, `generateShoppingListPdf` 等を手順内で正確に参照）

- [ ] **Step 1: SETUP.md を書く**

`SETUP.md` に以下の構成で書く（各節は具体的なクリック手順まで書き下すこと）:

```markdown
# 導入手順

## 前提
- Node.js 20以上（clasp用）
- Googleアカウント

## 1. clasp の準備（PC・初回のみ）
- `npm install -g @google/clasp`
- `clasp login`（ブラウザが開くのでGoogleアカウントで許可）
- https://script.google.com/home/usersettings で「Google Apps Script API」をONにする
- リポジトリ直下で `clasp create --type standalone --title "日用品在庫管理" --rootDir src`
  （`.clasp.json` が自動生成される。このファイルはコミットしない）
- `clasp push -f`

## 2. 初期セットアップの実行
- `clasp open` でGASエディタを開く
- ファイル一覧から `setup.gs` を選び、関数 `initSetup` を選択して「実行」
- 初回は権限の承認画面が出るのですべて許可
- 実行ログに出る「スプレッドシートURL」と「ntfyトピック名」を控える

## 3. Webアプリのデプロイ
- GASエディタ右上「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
- 「次のユーザーとして実行: 自分」「アクセスできるユーザー: 自分のみ」で「デプロイ」
- 表示されたURLをスマホに送り、Chromeで開いてGoogleログイン
- Chromeメニュー「ホーム画面に追加」でアイコン化

## 4. ntfy の設定（スマホ）
- Playストアで「ntfy」をインストール
- アプリで「+」→ 控えたトピック名（nichiyouhin-xxxx...）を購読
- GASエディタで関数 `testNtfy` を実行 → スマホに通知が届けばOK

## 5. 写真の登録
- Webアプリの「商品管理」タブ → 各商品の「編集」→ 写真を選択して保存

## 6. 在庫数・発注基準の修正
- 初期値はすべて在庫1・基準1。実際の数に直す

## 動作確認チェックリスト
1. [ ] 在庫の＋/−がスプレッドシート「商品」に反映され、「在庫履歴」に行が増える
2. [ ] 在庫を発注基準以下にすると「買い物リスト」タブに写真付きで表示される
3. [ ] GASエディタで `generateShoppingListPdf` を実行するとドライブ「日用品在庫管理/買い物リスト」にPDFができ、日本語・写真が正しく表示されている
4. [ ] `testNtfy` の通知がスマホに届く
5. [ ] 在庫を1件修正してから `reminderTrigger` を手動実行しても通知が来ない（17〜19日の期間中のみ検証可能。期間外は「在庫履歴」に手動で当月17日以降の日時の行を足して検証する）

## 補足
- トリガーは指定時刻から1時間以内のどこかで実行される（GASの仕様）
- 予測通知を有効にするには、スプレッドシート「設定」シートの「予測通知」を ON に変える（履歴が2〜3ヶ月たまってからを推奨）
- PC・スマホの電源が入っていなくてもトリガーはGoogleのサーバーで実行される
```

- [ ] **Step 2: README.md の「導入手順: SETUP.md（実装完了後に作成）」を「導入手順: [SETUP.md](SETUP.md)」に修正**

- [ ] **Step 3: Commit**

```bash
git add SETUP.md README.md
git commit -m "docs: 導入手順書と動作確認チェックリストを追加" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: デプロイと動作確認（ユーザーと一緒に実施）

**Files:** なし（作業タスク）

**Interfaces:**
- Consumes: SETUP.md の全手順

- [ ] **Step 1:** `npm test` が全件PASSすることを最終確認する
- [ ] **Step 2:** ユーザーに `clasp login` と Apps Script API 有効化を案内する（ブラウザでのGoogle認証はユーザー本人が行う）
- [ ] **Step 3:** `clasp create` → `clasp push -f` を実行する
- [ ] **Step 4:** SETUP.md の手順2〜6をユーザーと一緒に進める（`initSetup` 実行、デプロイ、ntfy設定、写真登録）
- [ ] **Step 5:** SETUP.md の動作確認チェックリスト1〜5を順に実施し、結果を報告する
- [ ] **Step 6:** 問題がなければ、ユーザーの承認を得てから `git push origin main` でGitHubへ反映する

---

## Self-Review（実施済み）

- **Spec coverage:** 在庫閲覧・更新=Task 5/9、自動買い物リスト=Task 2/9、PDF毎月19日7時=Task 6/8、17-19日リマインダー+スキップ=Task 3/6/7、履歴記録=Task 5、予測通知(フェーズ2・フラグ切替)=Task 4/6/7、写真表示=Task 5/9、列ずれ検知=Task 2/5、エラー表示と再読み込み=Task 9、手動チェックリスト=Task 10 — 全要件カバー。
- **Placeholder scan:** SETUP.md本文は手順書という成果物自体のため記述内容を具体的に指定済み。コードのTBDなし。
- **Type consistency:** Product型・関数名（`props_`, `buildShoppingList`, `shouldSkipReminder`, `estimateDaysUntilBelowThreshold`, `apiSaveProduct` のphoto引数形式）は全タスクで一致していることを確認。
