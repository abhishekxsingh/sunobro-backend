const toAdminDTO = (admin) => ({
  id: admin.id,
  name: admin.name,
  email: admin.email,
  role: admin.role,
});

const toCustomerDTO = (customer) => ({
  id: customer.id,
  name: customer.name,
  email: customer.email,
  phone: customer.phone,
});

const toProductDTO = (product) => ({
  id: product.id,
  slug: product.slug,
  name: product.name,
  price: Number(product.price),
  currency: product.currency,
  description: product.description,
  images: product.images,
  sizes: product.sizes,
  inStock: product.inStock,
});

const toOrderItemDTO = (item) => ({
  productId: item.productId,
  name: item.name,
  size: item.size,
  color: item.color,
  sku: item.sku,
  price: Number(item.price),
  qty: item.qty,
});

const toOrderDTO = (order) => ({
  id: order.id,
  reference: order.reference,
  status: order.status,
  items: (order.items || []).map(toOrderItemDTO),
  total: Number(order.total),
  currency: order.currency,
  createdAt: order.createdAt,
  destination: order.destination || undefined,
  estimatedArrival: order.estimatedArrival || undefined,
});

module.exports = {
  toAdminDTO, toCustomerDTO, toProductDTO, toOrderItemDTO, toOrderDTO,
};
