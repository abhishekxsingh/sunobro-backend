/**
 * Qikink mockup URLs use the dashboard asset folder id (`client_id`) and
 * `client_product_id` from POST …/products/fetch_my_products — not the My
 * Products CSV "Product ID" and not the Custom API ClientId.
 *
 * Spec default file is default.jpg; many accounts only expose Front_1_c_*.jpg,
 * so resolveQikinkCoverUrl probes both.
 */
const generateQikinkImageUrl = ({
  clientId, clientProductId, file = 'default.jpg',
} = {}) => {
  const assetClient = String(clientId || '').trim();
  const productId = String(clientProductId || '').trim();
  const imageFile = String(file || 'default.jpg').trim() || 'default.jpg';
  if (!assetClient || !productId) return null;
  return `https://qikink-assets.s3.ap-south-1.amazonaws.com/clients/${assetClient}/clientProducts/${productId}/images/${imageFile}`;
};

const qikinkImageExists = async (url) => {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
};

/** Prefer a reachable mockup: Front_1_c_1.jpg, then default.jpg. */
const resolveQikinkCoverUrl = async ({ clientId, clientProductId } = {}) => {
  const candidates = ['Front_1_c_1.jpg', 'default.jpg', 'Front_1_c_2.jpg'];
  for (let i = 0; i < candidates.length; i += 1) {
    const url = generateQikinkImageUrl({ clientId, clientProductId, file: candidates[i] });
    // eslint-disable-next-line no-await-in-loop
    if (url && await qikinkImageExists(url)) return url;
  }
  // Fall back to the documented default even if HEAD failed (CDN may block HEAD).
  return generateQikinkImageUrl({ clientId, clientProductId, file: 'default.jpg' });
};

/** Cover URL only when the product has none yet. */
const emptyCoverUrl = (product, assetClientId, assetProductId) => {
  if ((product?.images || []).length) return null;
  const clientProductId = assetProductId
    || product?.qikinkAssetProductId
    || product?.qikinkProductId;
  const clientId = assetClientId || product?.qikinkClientId;
  if (!clientId || !clientProductId) return null;
  return generateQikinkImageUrl({ clientId, clientProductId });
};

module.exports = {
  generateQikinkImageUrl, emptyCoverUrl, qikinkImageExists, resolveQikinkCoverUrl,
};
