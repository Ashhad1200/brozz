const { query } = require('../db/pool');
const { colorSlug } = require('../lib/slug');

const discountPercent = (price, actualPrice) => {
  if (!actualPrice || price >= actualPrice) return 0;
  return Math.round(((1 - price / actualPrice) * 100) / 5) * 5;
};

// Loads products with their variants and SKUs, keyed by product id.
const loadProducts = async (productIds, client = { query }) => {
  if (productIds.length === 0) return new Map();

  const [{ rows: products }, { rows: variants }, { rows: skus }] =
    await Promise.all([
      client.query('SELECT * FROM products WHERE id = ANY($1::uuid[])', [
        productIds,
      ]),
      client.query(
        'SELECT * FROM variants WHERE product_id = ANY($1::uuid[]) ORDER BY position, created_at',
        [productIds]
      ),
      client.query(
        'SELECT * FROM skus WHERE product_id = ANY($1::uuid[]) ORDER BY position',
        [productIds]
      ),
    ]);

  const byId = new Map(
    products.map((product) => [product.id, { ...product, variants: [] }])
  );
  const variantsById = new Map();

  for (const variant of variants) {
    const withSkus = { ...variant, skus: [] };
    variantsById.set(variant.id, withSkus);
    byId.get(variant.product_id).variants.push(withSkus);
  }
  for (const sku of skus) {
    variantsById.get(sku.variant_id)?.skus.push(sku);
  }

  return byId;
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
  return {
    variantId: variant.id,
    color: variant.color,
    price: variant.price,
    actualPrice: variant.actual_price,
    discount: discountPercent(variant.price, variant.actual_price),
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
    createdAt: product.created_at,
  };
};

const SORT_COLUMNS = {
  createdAt: 'p.created_at',
  price: 'v.price',
};

const listVariantCards = async ({
  collection = null,
  sortField = 'createdAt',
  direction = 'asc',
  offset = 0,
  limit = 12,
}) => {
  const sortColumn = SORT_COLUMNS[sortField] || SORT_COLUMNS.createdAt;
  const sortDirection = direction === 'desc' ? 'DESC' : 'ASC';

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total
       FROM variants v JOIN products p ON p.id = v.product_id
      WHERE ($1::text IS NULL OR p.collection = $1)`,
    [collection]
  );

  const { rows: page } = await query(
    `SELECT v.id, v.product_id
       FROM variants v JOIN products p ON p.id = v.product_id
      WHERE ($1::text IS NULL OR p.collection = $1)
      ORDER BY ${sortColumn} ${sortDirection}, v.position, v.id
      LIMIT $2 OFFSET $3`,
    [collection, limit, offset]
  );

  const products = await loadProducts([
    ...new Set(page.map((row) => row.product_id)),
  ]);

  const items = page.map((row) => {
    const product = products.get(row.product_id);
    const variant = product.variants.find((v) => v.id === row.id);
    return toVariantCard(product, variant);
  });

  const total = countRows[0].total;
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
    colorDisplay: variant.color_display,
    colorSlug: colorSlug(variant.color),
    variantPrice: variant.price,
    actualPrice: variant.actual_price,
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

  const productSlug = fullSlug.slice(0, lastDash);
  const color = fullSlug.slice(lastDash + 1);

  const { rows } = await query('SELECT id FROM products WHERE slug = $1', [
    productSlug,
  ]);
  if (rows.length === 0) return null;

  const products = await loadProducts([rows[0].id]);
  const product = toProductDetail(products.get(rows[0].id));
  const variant = product.variants.find((v) => v.colorSlug === color);

  return variant ? { product, variantId: variant.variantId } : null;
};

module.exports = {
  discountPercent,
  loadProducts,
  listVariantCards,
  toProductDetail,
  getProductBySlug,
  variantUrl,
};
