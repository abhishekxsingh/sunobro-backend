const QikinkCatalogService = require('../../services/admin/qikink-catalog');

const MAX_BYTES = 3 * 1024 * 1024;

const readText = ({ file, text }) => {
  if (typeof text === 'string' && text.trim()) return text;
  if (typeof file === 'string' && file) {
    return Buffer.from(file.replace(/^data:[^,]+,/, ''), 'base64').toString('utf8');
  }
  return null;
};

// Step 1 — Body: { file: <base64 CSV> | text, dryRun }.
const importExport = async (req, res) => {
  try {
    const text = readText(req.body || {});
    if (!text || Buffer.byteLength(text) > MAX_BYTES) {
      return res.badRequest('field-validation', [{ name: 'file', message: 'Attach the Qikink My Products export (.csv, under 3 MB).' }]);
    }
    const result = await QikinkCatalogService.importExport(text, { dryRun: req.body.dryRun !== false });
    return res.getRequest(result);
  } catch (error) {
    return res.serverError(error);
  }
};

// Step 2 — Body: { text: <pasted Product Variations>, images: { colour: url }, dryRun }.
const applyVariations = async (req, res) => {
  try {
    const { text, images, dryRun } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) {
      return res.badRequest('field-validation', [{ name: 'text', message: 'Paste the Product Variations table from Qikink.' }]);
    }
    if (images !== undefined && (typeof images !== 'object' || Array.isArray(images))) {
      return res.badRequest('field-validation', [{ name: 'images', message: 'images must map colour names to image links.' }]);
    }
    const result = await QikinkCatalogService.applyVariations(req.params.id, {
      text, images: images || {}, dryRun: dryRun !== false,
    });
    if (result.errors) return res.notFound();
    return res.getRequest(result);
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = { importExport, applyVariations };
