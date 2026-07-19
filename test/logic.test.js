const { test } = require('node:test');
const assert = require('node:assert');
const { HEADER, validateHeader, buildShoppingList, shouldSkipReminder } = require('../src/logic.js');

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
