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
