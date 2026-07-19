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
