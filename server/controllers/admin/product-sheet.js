const ProductSheetService = require('../../services/admin/product-sheet');

const MAX_BYTES = 3 * 1024 * 1024;

// Body: { file: <base64 .xlsx>, dryRun: boolean }. dryRun (the default) only
// previews; nothing is written until the admin confirms with dryRun: false.
const importSheet = async (req, res) => {
  try {
    const { file, dryRun = true } = req.body || {};
    if (typeof file !== 'string' || !file) {
      return res.badRequest('field-validation', [{ name: 'file', message: 'Attach the product sheet (.xlsx).' }]);
    }
    const buffer = Buffer.from(file.replace(/^data:[^,]+,/, ''), 'base64');
    if (buffer.length === 0 || buffer.length > MAX_BYTES) {
      return res.badRequest('field-validation', [{ name: 'file', message: 'The sheet must be an .xlsx file under 3 MB.' }]);
    }
    let result;
    try {
      result = await ProductSheetService.importSheet(buffer, { dryRun: dryRun !== false });
    } catch (err) {
      return res.badRequest('field-validation', [{ name: 'file', message: 'Could not read that file — save it as .xlsx and try again.' }]);
    }
    return res.getRequest(result);
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = { importSheet };
