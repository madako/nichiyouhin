function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('日用品在庫管理')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
