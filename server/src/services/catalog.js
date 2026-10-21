const { prisma, toNumber } = require('../db/prisma');
const { colorSlug } = require('../lib/slug');

const discountPercent = (price, actualPrice) => {
  if (!actualPrice || price >= actualPrice) return 0;
  return Math.round(((1 - price / actualPrice) * 100) / 5) * 5;
};

// Products with their variants and SKUs, in display order.
const PRODUCT_INCLUDE = {
  variants: {
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: { skus: { orderBy: { position: 'asc' } } },
  },
};

// Loads products with their variants and SKUs, keyed by product id.
const loadProducts = async (productIds, db = prisma) => {
  if (productIds.length === 0) return new Map();

  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    include: PRODUCT_INCLUDE,
  });

  return new Map(products.map((product) => [product.id, product]));
};

const variantUrl = (product, variant) =>
  `${product.slug}-${colorSlug(variant.color)}`;

const toSlides = (product, variant) =>
  variant.images.map((image) => ({
    id: image.id,
    src: image.src,
    alt: `${product.model} ${product.type} ${variant.color}`,
    url: variantUrl(product, variant),
  }));

const toCardSkus = (variant) =>
  variant.skus.map((sku) => ({
    skuId: sku.id,
    size: sku.size,
    quantity: sku.quantity,
  }));

const variantSummary = (product, variant) => {
  const skus = toCardSkus(variant);
  const price = toNumber(variant.price);
  const actualPrice = toNumber(variant.actualPrice);
  return {
    variantId: variant.id,
    color: variant.color,
    price,
    actualPrice,
    discount: discountPercent(price, actualPrice),
    slides: toSlides(product, variant),
    skus,
    isSoldOut: skus.every((sku) => sku.quantity <= 0),
  };
};

// One storefront card per variant; this is what product grids render.
const toVariantCard = (product, variant) => {
  const summary = variantSummary(product, variant);
  const availableQuantity = {};
  for (const sku of variant.skus) {
    availableQuantity[sku.size] = sku.quantity;
  }

  return {
    ...summary,
    id: variant.id,
    productId: product.id,
    model: product.model,
    type: product.type,
    collection: product.collection,
    fit: product.fit,
    images: variant.images,
    sizes: variant.skus.map((sku) => sku.size),
    availableQuantity,
    numberOfVariants: product.variants.length,
    allVariants: product.variants.map((v) => variantSummary(product, v)),
    createdAt: product.createdAt,
  };
};

const listVariantCards = async ({
  collection = null,
  sortField = 'createdAt',
  direction = 'asc',
  offset = 0,
  limit = 12,
}) => {
  const where = collection ? { product: { collection } } : {};
  const dir = direction === 'desc' ? 'desc' : 'asc';
  const primarySort =
    sortField === 'price' ? { price: dir } : { product: { createdAt: dir } };

  const [total, page] = await Promise.all([
    prisma.variant.count({ where }),
    prisma.variant.findMany({
      where,
      orderBy: [primarySort, { position: 'asc' }, { id: 'asc' }],
      skip: offset,
      take: limit,
      select: { id: true, productId: true },
    }),
  ]);

  const products = await loadProducts([
    ...new Set(page.map((row) => row.productId)),
  ]);

  const items = page.map((row) => {
    const product = products.get(row.productId);
    const variant = product.variants.find((v) => v.id === row.id);
    return toVariantCard(product, variant);
  });

  return { items, total, hasMore: offset + items.length < total };
};

// The product page payload: the product with every variant and its sizes.
const toProductDetail = (product) => ({
  productId: product.id,
  slug: product.slug,
  model: product.model,
  type: product.type,
  collection: product.collection,
  description: product.description,
  fit: product.fit,
  tags: product.tags,
  variants: product.variants.map((variant) => ({
    variantId: variant.id,
    color: variant.color,
    colorDisplay: variant.colorDisplay,
    colorSlug: colorSlug(variant.color),
    variantPrice: toNumber(variant.price),
    actualPrice: toNumber(variant.actualPrice),
    images: variant.images,
    sizes: variant.skus.map((sku) => ({
      skuId: sku.id,
      value: sku.size,
      quantity: sku.quantity,
    })),
  })),
});

// Resolves "<product-slug>-<color>" to a product and the matching variant.
const getProductBySlug = async (fullSlug) => {
  const lastDash = fullSlug.lastIndexOf('-');
  if (lastDash <= 0) return null;

  const product = await prisma.product.findUnique({
    where: { slug: fullSlug.slice(0, lastDash) },
    include: PRODUCT_INCLUDE,
  });
  if (!product) return null;

  const detail = toProductDetail(product);
  const color = fullSlug.slice(lastDash + 1);
  const variant = detail.variants.find((v) => v.colorSlug === color);

  return variant ? { product: detail, variantId: variant.variantId } : null;
};

module.exports = {
  discountPercent,
  loadProducts,
  listVariantCards,
  toProductDetail,
  getProductBySlug,
  variantUrl,
};
