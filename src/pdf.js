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
