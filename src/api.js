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
