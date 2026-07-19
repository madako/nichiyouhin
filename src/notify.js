function sendNotification_(subject, message) {
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), subject, message);
}

// 毎月17日19時台・18日19時台・19日6時台に実行
function reminderTrigger() {
  var now = new Date();
  if (shouldSkipReminder(getHistoryTimestamps(), now)) return;
  var count = buildShoppingList(getProducts()).length;
  sendNotification_('【日用品】在庫の確認をお願いします', '現在の買い時商品: ' + count + '件');
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
  if (soon.length > 0) sendNotification_('【日用品】もうすぐ無くなりそうです', soon.join('、'));
}

// SETUP時の動作確認用。GASエディタから手動実行する。
function testNotification() {
  sendNotification_('【日用品】テスト通知です', 'このメールが届いていれば設定成功です！');
}
