const fs = require('fs/promises');
const path = require('path');

const config = require('../config');
const { query, withTransaction } = require('../db/pool');
const { badRequest, notFound } = require('../lib/errors');
const {
  cleanString,
  isUuid,
  toNonNegativeInt,
  toNonNegativeNumber,
} = require('../lib/validate');
const { slugify, colorSlug } = require('../lib/slug');
const { loadProducts } = require('./catalog');

const PRODUCT_COLLECTIONS = ['t-shirts', 'hoodies-sweatshirts', 'accessories'];
const SIZE_CODES = { s: 'SM', m: 'MD', l: 'LG', xl: 'XL', xxl: 'XX', os: 'OS' };

const readImage = (image) => {
  if (!image || typeof image.src !== 'string' || !image.src) {
    throw badRequest('Every image needs a src');
  }
  return {
    id: String(image.id || image.name || image.src),
    name: String(image.name || path.basename(image.src)),
    src: image.src,
  };
};

const readProductInput = ({ product = {}, variants, images = [] }) => {
  const collection = cleanString(product.collection, 'Collection');
  if (!PRODUCT_COLLECTIONS.includes(collection)) {
    throw badRequest(`Collection must be one of: ${PRODUCT_COLLECTIONS.join(', ')}`);
  }

  const sizes = Array.isArray(product.sizes)
    ? [...new Set(product.sizes.map((size) => String(size).toLowerCase()))]
    : [];
  if (sizes.length === 0) throw badRequest('Select at least one size');
  for (const size of sizes) {
    if (!SIZE_CODES[size]) throw badRequest(`Unknown size "${size}"`);
  }

  if (!Array.isArray(variants) || variants.length === 0) {
    throw badRequest('Add at least one variant');
  }

  const seenColors = new Set();
  const cleanVariants = variants.map((variant, index) => {
    const label = `Variant ${index + 1}`;
    const color = cleanString(variant.color, `${label} color`, { max: 40 }).toLowerCase();
    if (!colorSlug(color)) throw badRequest(`${label} color is not valid`);
    if (seenColors.has(colorSlug(color))) {
      throw badRequest(`Two variants share the color "${color}"`);
    }
    seenColors.add(colorSlug(color));

    const price = toNonNegativeNumber(variant.currentPrice, `${label} current price`);
    const actualPrice = toNonNegativeNumber(variant.actualPrice, `${label} actual price`);
    if (price > actualPrice) {
      throw badRequest(`${label} current price can't be higher than its actual price`);
    }

    const variantImages = Array.isArray(variant.images)
      ? variant.images.map(readImage)
      : [];
    if (variantImages.length === 0) {
      throw badRequest(`${label} needs at least one image`);
    }

    const inventory = {};
    for (const size of sizes) {
      inventory[size] = toNonNegativeInt(
        variant.inventory?.[size] ?? 0,
        `${label} ${size.toUpperCase()} stock`
      );
    }

    return {
      id: isUuid(variant.id) ? variant.id : null,
      color,
      colorDisplay: cleanString(variant.colorDisplay, `${label} display color`, {
        required: false,
        max: 40,
      })?.toLowerCase() || null,
      price,
      actualPrice,
      images: variantImages,
      inventory,
    };
  });

  return {
    model: cleanString(product.model, 'Model', { max: 100 }).toLowerCase(),
    type: cleanString(product.type, 'Type', { max: 100 }).toLowerCase(),
    collection,
    description: cleanString(product.description, 'Description', { max: 2000 }),
    fit: cleanString(product.fit, 'Fit', { required: false, max: 40 })?.toLowerCase() || null,
    baseSku: cleanString(product.sku, 'Base SKU', { max: 20 })
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, ''),
    tags: Array.isArray(product.tags)
      ? product.tags
          .map((tag) => String(tag?.content ?? tag).trim().toLowerCase())
          .filter(Boolean)
          .map((content) => ({ content }))
      : [],
    sizes,
    images: images.map(readImage),
    variants: cleanVariants,
  };
};

const skuCode = (baseSku, color, size) => {
  const words = color.split(' ');
  const colorCode =
    words.length > 1
      ? words[0].slice(0, 1) + words[1].slice(0, 2)
      : color.slice(0, 3);
  return `${baseSku}-${colorCode}-${SIZE_CODES[size]}`.toUpperCase();
};

// Picks a slug no other product uses: "hoodie-de-gira", then "hoodie-de-gira-2"...
const uniqueSlug = async (client, base, productId) => {
  let slug = base;
  for (let n = 2; ; n++) {
    const { rows } = await client.query(
      'SELECT id FROM products WHERE slug = $1 AND id IS DISTINCT FROM $2',
      [slug, productId]
    );
    if (rows.length === 0) return slug;
    slug = `${base}-${n}`;
  }
};

const syncVariants = async (client, productId, input) => {
  const { rows: existing } = await client.query(
    'SELECT id FROM variants WHERE product_id = $1',
    [productId]
  );
  const existingIds = new Set(existing.map((row) => row.id));
  const keptIds = [];

  for (const [position, variant] of input.variants.entries()) {
    let variantId;
    if (variant.id && existingIds.has(variant.id)) {
      variantId = variant.id;
      await client.query(
        `UPDATE variants SET color = $2, color_display = $3, price = $4, actual_price = $5,
                images = $6, position = $7, updated_at = NOW()
          WHERE id = $1`,
        [
          variantId,
          variant.color,
          variant.colorDisplay,
          variant.price,
          variant.actualPrice,
          JSON.stringify(variant.images),
          position,
        ]
      );
    } else {
      const { rows } = await client.query(
        `INSERT INTO variants (product_id, color, color_display, price, actual_price, images, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          productId,
          variant.color,
          variant.colorDisplay,
          variant.price,
          variant.actualPrice,
          JSON.stringify(variant.images),
          position,
        ]
      );
      variantId = rows[0].id;
    }
    keptIds.push(variantId);

    // Drop SKUs for sizes that were removed, then upsert the rest by size so
    // SKU ids (and the carts pointing at them) survive edits.
    await client.query(
      'DELETE FROM skus WHERE variant_id = $1 AND NOT (size = ANY($2::text[]))',
      [variantId, input.sizes]
    );
    for (const [sizePosition, size] of input.sizes.entries()) {
      const code = skuCode(input.baseSku, variant.color, size);
      const quantity = variant.inventory[size];
      const { rowCount } = await client.query(
        `UPDATE skus SET sku = $3, quantity = $4, position = $5, updated_at = NOW()
          WHERE variant_id = $1 AND size = $2`,
        [variantId, size, code, quantity, sizePosition]
      );
      if (rowCount === 0) {
        await client.query(
          `INSERT INTO skus (product_id, variant_id, sku, size, quantity, position)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [productId, variantId, code, size, quantity, sizePosition]
        );
      }
    }
  }

  await client.query(
    'DELETE FROM variants WHERE product_id = $1 AND NOT (id = ANY($2::uuid[]))',
    [productId, keptIds]
  );
};

// Removes uploaded files that no product references any more.
const removeUnusedUploads = async (images) => {
  for (const image of images) {
    if (!image.src.startsWith('/uploads/')) continue;
    const { rows } = await query(
      `SELECT 1 FROM products WHERE images @> $1::jsonb
       UNION ALL SELECT 1 FROM variants WHERE images @> $1::jsonb LIMIT 1`,
      [JSON.stringify([{ src: image.src }])]
    );
    if (rows.length === 0) {
      const file = path.join(config.uploadDir, path.basename(image.src));
      await fs.rm(file, { force: true });
    }
  }
};

const saveProduct = async (body, productId = null) => {
  const input = readProductInput(body);

  let previousImages = [];
  const id = await withTransaction(async (client) => {
    const slug = await uniqueSlug(
      client,
      slugify(`${input.model} ${input.type}`),
      productId
    );
    const values = [
      slug,
      input.model,
      input.type,
      input.collection,
      input.description,
      input.fit,
      input.baseSku,
      input.sizes,
      JSON.stringify(input.tags),
      JSON.stringify(input.images),
    ];

    let savedId = productId;
    if (productId) {
      const { rows: current } = await client.query(
        'SELECT images FROM products WHERE id = $1 FOR UPDATE',
        [productId]
      );
      if (current.length === 0) throw notFound('Product not found');
      previousImages = current[0].images;

      await client.query(
        `UPDATE products SET slug = $1, model = $2, type = $3, collection = $4,
                description = $5, fit = $6, base_sku = $7, sizes = $8, tags = $9,
                images = $10, updated_at = NOW()
          WHERE id = $11`,
        [...values, productId]
      );
    } else {
      const { rows } = await client.query(
        `INSERT INTO products (slug, model, type, collection, description, fit, base_sku, sizes, tags, images)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        values
      );
      savedId = rows[0].id;
    }

    await syncVariants(client, savedId, input);
    return savedId;
  });

  const keptSrcs = new Set(input.images.map((image) => image.src));
  await removeUnusedUploads(
    previousImages.filter((image) => !keptSrcs.has(image.src))
  );

  return id;
};

// The shape the admin edit form is initialised from.
const getProductForEdit = async (productId) => {
  const products = await loadProducts([productId]);
  const product = products.get(productId);
  if (!product) throw notFound('Product not found');

  const sizesInput = { s: false, m: false, l: false, xl: false, xxl: false };
  for (const size of product.sizes) sizesInput[size] = true;

  return {
    id: product.id,
    slug: product.slug,
    model: product.model,
    type: product.type,
    collection: product.collection,
    description: product.description,
    fit: product.fit,
    baseSku: product.base_sku,
    tags: product.tags,
    sizes: product.sizes,
    sizesInput,
    images: product.images,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      color: variant.color,
      colorDisplay: variant.color_display || '',
      currentPrice: variant.price,
      actualPrice: variant.actual_price,
      images: variant.images,
      inventory: Object.fromEntries(
        variant.skus.map((sku) => [sku.size, sku.quantity])
      ),
    })),
  };
};

const deleteProduct = async (productId) => {
  const { rows } = await query(
    'DELETE FROM products WHERE id = $1 RETURNING images',
    [productId]
  );
  if (rows.length === 0) throw notFound('Product not found');
  await removeUnusedUploads(rows[0].images);
};

// Deletes one variant; deleting the last variant deletes the whole product.
const deleteVariant = async (productId, variantId) => {
  const productDeleted = await withTransaction(async (client) => {
    const { rowCount } = await client.query(
      'DELETE FROM variants WHERE id = $1 AND product_id = $2',
      [variantId, productId]
    );
    if (rowCount === 0) throw notFound('Variant not found');

    const { rows } = await client.query(
      'SELECT COUNT(*)::int AS count FROM variants WHERE product_id = $1',
      [productId]
    );
    return rows[0].count === 0;
  });

  if (productDeleted) await deleteProduct(productId);
  return { productDeleted };
};

module.exports = {
  PRODUCT_COLLECTIONS,
  saveProduct,
  getProductForEdit,
  deleteProduct,
  deleteVariant,
  removeUnusedUploads,
};
