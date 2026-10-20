const toAdminDTO = (admin) => ({
  id: admin.id,
  name: admin.name,
  email: admin.email,
  role: admin.role,
});

const toAddressDTO = (address) => ({
  id: address.id,
  label: address.label || 'Home',
  firstName: address.firstName,
  lastName: address.lastName,
  phone: address.phone,
  street: address.street,
  city: address.city,
  state: address.state || '',
  postalCode: address.postalCode,
  country: address.country || 'India',
  isDefault: Boolean(address.isDefault),
});

const toCustomerDTO = (customer) => {
  let authMethod = 'password';
  if (customer.firebaseUid && customer.passwordHash) authMethod = 'both';
  else if (customer.firebaseUid) authMethod = 'google';

  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone || '',
    authMethod,
    addresses: (customer.addresses || []).map(toAddressDTO),
  };
};

const toProductDTO = (product) => ({
  id: product.id,
  slug: product.slug,
  name: product.name,
  price: Number(product.price),
  currency: product.currency,
  description: product.description,
  images: product.images,
  sizes: product.sizes,
  inStock: product.trackInventory ? product.inStock : true,
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

// Shoppers see plain-language progress, never Qikink's internal labels or
// our own push states (submitting/error/skipped).
const CUSTOMER_FULFILMENT_LABELS = [
  [['printed', 's-printed', 'partially printed', 'stitched/qc'], 'Printed — packing'],
  [['manifested', 'dispatch ready', 'picked up'], 'Packed — awaiting courier'],
  [['in-transit', 'delivery rescheduled', 'misrouted', 'exception'], 'In transit'],
  [['out for delivery'], 'Out for delivery'],
  [['delivered'], 'Delivered'],
  [['cancelled'], 'Cancelled'],
  [['rto initiated', 'returned', 'partially returned', 'lost', 'refused to accept',
    'maximum attempts reached', 'incorrect/incomplete address', 'consignee unavailable',
    'not attempted', 'otp not shared', 'otp verification cancelled', 'open delivery refused',
    'residence / office closed', 'oda'], 'Delivery issue — we will contact you'],
];

const toCustomerFulfilmentLabel = (qikinkStatus) => {
  if (!qikinkStatus) return null;
  const label = String(qikinkStatus).trim().toLowerCase();
  const match = CUSTOMER_FULFILMENT_LABELS.find(([labels]) => labels.includes(label));
  return match ? match[1] : 'Processing';
};

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
  qikinkOrderId: order.qikinkOrderId || null,
  qikinkStatus: toCustomerFulfilmentLabel(order.qikinkStatus),
  // Fulfilment errors are for admins (missing SKUs, API failures) — never shown to shoppers.
  qikinkError: null,
  trackingLink: (order.qikinkAwb && order.qikinkTrackingLink) || null,
  awb: order.qikinkAwb || null,
  courier: order.qikinkCourier || null,
  shipping: {
    firstName: order.shippingFirstName,
    lastName: order.shippingLastName,
    street: order.shippingStreet,
    city: order.shippingCity,
    state: order.shippingState || null,
    postalCode: order.shippingPostalCode,
    country: order.shippingCountry,
    email: order.shippingEmail || null,
    phone: order.shippingPhone || null,
  },
});

const toVariantDTO = (variant) => ({
  id: variant.id || variant._id,
  productId: variant.productId,
  size: variant.size,
  color: variant.color,
  sku: variant.sku,
  stock: variant.stock,
  price: variant.price ?? null,
  qikinkSku: variant.qikinkSku ?? null,
  image: variant.image ?? null,
  enabled: variant.enabled !== false,
});

// Print-on-demand variants (trackInventory off) are always available and
// report no stock count.
const toCustomerVariantDTO = (variant, trackInventory = true) => ({
  id: variant.id || variant._id,
  size: variant.size,
  color: variant.color,
  sku: variant.sku,
  stock: trackInventory ? variant.stock : null,
  available: trackInventory ? variant.stock > 0 : true,
  price: variant.price ?? null,
  image: variant.image ?? null,
});

const toProductWithVariantsDTO = (product, variants = []) => ({
  ...toProductDTO(product),
  variants: Array.isArray(variants)
    ? variants.map((v) => toCustomerVariantDTO(v, Boolean(product.trackInventory)))
    : [],
});

const toFullProductDTO = (product, variants = []) => ({
  ...toProductDTO(product),
  status: product.status,
  trackInventory: Boolean(product.trackInventory),
  mappedCount: product.mappedCount ?? variants.filter((v) => Boolean(v.qikinkSku)).length,
  enabledCount: product.enabledCount ?? variants.filter((v) => v.enabled !== false).length,
  variantCount: product.variantCount ?? variants.length,
  totalStock: product.totalStock ?? variants.reduce((sum, v) => sum + v.stock, 0),
  qikinkSynced: product.qikinkSynced ?? variants.every((v) => Boolean(v.qikinkSku)),
  variants: variants.map ? variants.map(toVariantDTO) : [],
  createdAt: product.createdAt,
  updatedAt: product.updatedAt,
});

module.exports = {
  toAdminDTO,
  toCustomerDTO,
  toProductDTO,
  toOrderItemDTO,
  toOrderDTO,
  toCustomerVariantDTO,
  toProductWithVariantsDTO,
  toVariantDTO,
  toFullProductDTO,
};
