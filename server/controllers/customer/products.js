const ProductsService = require('../../services/customer/products');
const { toProductDTO, toProductWithVariantsDTO } = require('../../utils/serializers');

const list = async (req, res) => {
  try {
    const { query: { page, limit } } = req;
    const { doc, meta } = await ProductsService.list({ page, limit });

    res.setHeader('x-coreplatform-total-records', meta.totalRecords);
    res.setHeader('x-coreplatform-page', meta.page);
    res.setHeader('x-coreplatform-limit', meta.limit);

    return res.getRequest(doc.map(toProductDTO));
  } catch (error) {
    return res.serverError(error);
  }
};

const get = async (req, res) => {
  try {
    const { params: { idOrSlug } } = req;
    const result = await ProductsService.get(idOrSlug);

    if (result.errors) {
      return res.notFound();
    }

    return res.getRequest(toProductWithVariantsDTO(result.doc, result.variants));
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = { list, get };
