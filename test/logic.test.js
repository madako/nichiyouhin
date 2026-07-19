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
