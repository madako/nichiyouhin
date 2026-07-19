// 純粋ロジック（GAS APIに依存しない）。Nodeでテストする。
var HEADER = ['ID', '商品名', 'メーカー', 'カテゴリ', '容量・備考', '在庫数', '発注基準', '写真', '更新日時'];

function validateHeader(row) {
  return HEADER.every(function (h, i) { return row[i] === h; });
}

function buildShoppingList(products) {
  return products.filter(function (p) { return p.stock <= p.threshold; });
}

function shouldSkipReminder(historyTimestamps, now) {
  var windowStart = new Date(now.getFullYear(), now.getMonth(), 17, 0, 0, 0);
  return historyTimestamps.some(function (t) { return t >= windowStart && t <= now; });
}

if (typeof module !== 'undefined') {
  module.exports = {
    HEADER: HEADER,
    validateHeader: validateHeader,
    buildShoppingList: buildShoppingList,
    shouldSkipReminder: shouldSkipReminder
  };
}
